import { Request, Response } from 'express';
import { prisma } from '../database/client';
import { AgentRepository } from '../database/repositories/agent-repository';
import { autonomousWorker } from '../agents/autonomous-worker';
import { MemoryService } from '../memory/memory-service';
import { aiTelemetry } from '../ai/ai-telemetry';
import { logger } from '../utils/logger';

/**
 * GET /api/monitor/overview
 * Returns agent list with per-agent topic/post stats and system-wide totals.
 */
export async function handleMonitorOverview(_req: Request, res: Response) {
  try {
    const agents = await prisma.agent.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const agentsWithStats = await Promise.all(
      agents.map(async (agent) => {
        const [
          totalTopicsDiscovered,
          topicsPending,
          topicsSelected,
          topicsRejected,
          topicsPublished,
          totalPosts,
          postsToday,
        ] = await Promise.all([
          prisma.topic.count({ where: { agentId: agent.id } }),
          prisma.topic.count({ where: { agentId: agent.id, status: 'discovered' } }),
          prisma.topic.count({ where: { agentId: agent.id, status: 'selected' } }),
          prisma.topic.count({ where: { agentId: agent.id, status: 'rejected' } }),
          prisma.topic.count({ where: { agentId: agent.id, status: 'published' } }),
          prisma.post.count({ where: { agentId: agent.id } }),
          prisma.post.count({ where: { agentId: agent.id, createdAt: { gte: todayStart } } }),
        ]);

        let persona = {};
        try {
          persona = JSON.parse(agent.personaConfig);
        } catch (e) {}

        const schedule = autonomousWorker.getWorkerSchedule(agent.id);

        const nextUpTopic = await prisma.topic.findFirst({
          where: { agentId: agent.id, status: 'selected' },
          orderBy: { score: 'desc' },
          select: { title: true },
        });

        return {
          id: agent.id,
          name: (persona as any).name || agent.name,
          domain: (persona as any).domain || agent.domain,
          status: agent.status,
          createdAt: agent.createdAt.toISOString(),
          personaConfig: agent.personaConfig,
          schedule,
          nextUpTopicTitle: nextUpTopic?.title || null,
          stats: {
            totalTopicsDiscovered,
            topicsPending,
            topicsSelected,
            topicsRejected,
            topicsPublished,
            totalPosts,
            postsToday,
          },
        };
      })
    );

    const systemStats = {
      totalAgents: agents.length,
      totalPosts: agentsWithStats.reduce((sum, a) => sum + a.stats.totalPosts, 0),
      totalTopics: agentsWithStats.reduce((sum, a) => sum + a.stats.totalTopicsDiscovered, 0),
      postsToday: agentsWithStats.reduce((sum, a) => sum + a.stats.postsToday, 0),
    };

    return res.status(200).json({ agents: agentsWithStats, systemStats });
  } catch (err) {
    logger.error('Error in /api/monitor/overview', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/monitor/agent/:id/details
 * Returns deep-dive details for an agent: persona profile, post queue, recent publications, and schedule.
 */
export async function handleAgentDetails(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const agent = await AgentRepository.findById(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // Fetch pending topic queue (discovered & selected)
    const pendingQueue = await prisma.topic.findMany({
      where: {
        agentId: id,
        status: { in: ['discovered', 'selected'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Fetch recent posts
    const recentPosts = await prisma.post.findMany({
      where: { agentId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { topic: true },
    });

    // Query single highest-scoring topic approved for next publication
    const nextUpTopic = await prisma.topic.findFirst({
      where: {
        agentId: id,
        status: 'selected',
      },
      orderBy: { score: 'desc' },
    });

    let persona = {};
    try {
      persona = JSON.parse(agent.personaConfig);
    } catch (e) {}

    return res.status(200).json({
      agent: {
        id: agent.id,
        name: (persona as any).name || agent.name,
        domain: (persona as any).domain || agent.domain,
        status: agent.status,
        createdAt: agent.createdAt.toISOString(),
        persona,
      },
      nextUpTopic: nextUpTopic
        ? {
            id: nextUpTopic.id,
            title: nextUpTopic.title,
            score: nextUpTopic.score,
            canonicalUrl: nextUpTopic.canonicalUrl,
            createdAt: nextUpTopic.createdAt.toISOString(),
          }
        : null,
      pendingQueue: pendingQueue.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        score: t.score,
        canonicalUrl: t.canonicalUrl,
        createdAt: t.createdAt.toISOString(),
      })),
      recentPosts: recentPosts.map((p) => ({
        id: p.id,
        title: p.topic?.title || 'Published Technical Post',
        text: p.text,
        rationale: p.rationale,
        createdAt: p.createdAt.toISOString(),
      })),
      workerSchedule: {
        intervalMinutes: 5,
        status: agent.status === 'active' ? 'Running every 5m' : 'Paused',
      },
    });
  } catch (err) {
    logger.error('Error fetching agent details', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/monitor/activity
 * Returns recent activity log (editorial decisions & publications).
 */
export async function handleMonitorActivity(req: Request, res: Response) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const decisions = await prisma.editorialDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        topic: {
          include: { agent: true },
        },
      },
    });

    const activity = decisions.map((d) => {
      let scoresObj: any = {};
      try {
        scoresObj = JSON.parse(d.scores);
      } catch (e) {}

      let persona = {};
      try {
        if (d.topic.agent.personaConfig) persona = JSON.parse(d.topic.agent.personaConfig);
      } catch (e) {}

      return {
        type: d.decision === 'publish' ? 'topic_selected' : 'topic_rejected',
        agentId: d.topic.agentId,
        agentName: (persona as any).name || d.topic.agent.name,
        title: d.topic.title,
        score: scoresObj.weightedEditorialScore || d.topic.score,
        reason: d.reason,
        timestamp: d.createdAt.toISOString(),
      };
    });

    return res.status(200).json({ activity });
  } catch (err) {
    logger.error('Error in /api/monitor/activity', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/monitor/posts
 * Returns recent published posts across all agents.
 */
export async function handleMonitorPosts(req: Request, res: Response) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        agent: true,
        topic: true,
        sources: true,
      },
    });

    const formattedPosts = posts.map((p) => {
      let persona = {};
      try {
        if (p.agent.personaConfig) persona = JSON.parse(p.agent.personaConfig);
      } catch (e) {}

      return {
        id: p.id,
        agentId: p.agentId,
        agentName: (persona as any).name || p.agent.name,
        agentDomain: (persona as any).domain || p.agent.domain,
        text: p.text,
        rationale: p.rationale,
        topicTitle: p.topic.title,
        sources: p.sources.map((s) => s.url),
        createdAt: p.createdAt.toISOString(),
      };
    });

    return res.status(200).json({ posts: formattedPosts });
  } catch (err) {
    logger.error('Error in /api/monitor/posts', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/monitor/ai-logs
 * Returns live AI usage call telemetry logs & token statistics.
 */
export async function handleAiLogs(req: Request, res: Response) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const logs = aiTelemetry.getLogs(limit);
    const stats = aiTelemetry.getStats();
    return res.status(200).json({ logs, stats });
  } catch (err) {
    logger.error('Error in /api/monitor/ai-logs', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/monitor/agent/:id/pause
 */
export async function handleAgentPause(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const agent = await AgentRepository.findById(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    await AgentRepository.updateStatus(id, 'paused');
    await autonomousWorker.stopWorkerForAgent(id);
    logger.info('Agent paused via dashboard', { agentId: id });
    return res.status(200).json({ success: true, status: 'paused' });
  } catch (err) {
    logger.error('Error pausing agent', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/monitor/agent/:id/resume
 */
export async function handleAgentResume(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const agent = await AgentRepository.findById(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    await AgentRepository.updateStatus(id, 'active');
    await autonomousWorker.startWorkerForAgent(id);
    logger.info('Agent resumed via dashboard', { agentId: id });
    return res.status(200).json({ success: true, status: 'active' });
  } catch (err) {
    logger.error('Error resuming agent', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * DELETE /api/monitor/agent/:id
 */
export async function handleAgentDelete(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const agent = await AgentRepository.findById(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    // 1. Stop background worker interval
    await autonomousWorker.stopWorkerForAgent(id);

    // 2. Purge vector memory from Breeth and local fallback cache
    await MemoryService.purgeAgentMemory(id);

    // 3. Cascade delete all agent records (topics, posts, decisions, jobs, agent)
    await AgentRepository.deleteAgent(id);

    logger.info('Agent and all associated memory successfully purged from everywhere', { agentId: id });
    return res.status(200).json({ success: true, message: 'Agent and memory completely freed.' });
  } catch (err) {
    logger.error('Error deleting agent and purging memory', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/monitor/agent/:id/trigger
 */
export async function handleAgentTriggerCycle(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const agent = await AgentRepository.findById(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (agent.status !== 'active') return res.status(400).json({ error: 'Agent is not active' });

    autonomousWorker.executeCycle(id).catch((err) => {
      logger.error('Manually triggered cycle failed', { agentId: id }, err);
    });
    logger.info('Manual cycle triggered via dashboard', { agentId: id });
    return res.status(200).json({ success: true, message: 'Cycle triggered' });
  } catch (err) {
    logger.error('Error triggering cycle', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
