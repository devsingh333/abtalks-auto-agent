import { Request, Response } from 'express';
import { prisma } from '../database/client';
import { AgentRepository } from '../database/repositories/agent-repository';
import { autonomousWorker } from '../agents/autonomous-worker';
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

        const persona = JSON.parse(agent.personaConfig);

        return {
          id: agent.id,
          name: persona.name || agent.name,
          domain: persona.domain || agent.domain,
          status: agent.status,
          createdAt: agent.createdAt.toISOString(),
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
 * GET /api/monitor/activity?limit=50
 * Returns recent editorial decisions and post publications as an activity feed.
 */
export async function handleMonitorActivity(req: Request, res: Response) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    // Fetch recent editorial decisions
    const decisions = await prisma.editorialDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        topic: {
          include: {
            agent: true,
          },
        },
      },
    });

    // Fetch recent posts
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        agent: true,
        topic: true,
      },
    });

    // Combine and sort by timestamp
    const activity: Array<{
      type: string;
      agentId: string;
      agentName: string;
      title: string;
      score: number | null;
      reason?: string;
      timestamp: string;
    }> = [];

    for (const post of posts) {
      const persona = JSON.parse(post.agent.personaConfig);
      activity.push({
        type: 'post_published',
        agentId: post.agentId,
        agentName: persona.name || post.agent.name,
        title: post.topic.title,
        score: post.topic.score,
        timestamp: post.createdAt.toISOString(),
      });
    }

    for (const decision of decisions) {
      const persona = JSON.parse(decision.topic.agent.personaConfig);
      activity.push({
        type: decision.decision === 'publish' ? 'topic_selected' : 'topic_rejected',
        agentId: decision.topic.agentId,
        agentName: persona.name || decision.topic.agent.name,
        title: decision.topic.title,
        score: decision.topic.score,
        reason: decision.reason,
        timestamp: decision.createdAt.toISOString(),
      });
    }

    // Sort descending by timestamp
    activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return res.status(200).json({ activity: activity.slice(0, limit) });
  } catch (err) {
    logger.error('Error in /api/monitor/activity', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/monitor/posts?limit=20
 * Returns recently published posts with agent and topic metadata.
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

    const formattedPosts = posts.map((post) => {
      const persona = JSON.parse(post.agent.personaConfig);
      return {
        id: post.id,
        agentId: post.agentId,
        agentName: persona.name || post.agent.name,
        agentDomain: persona.domain || post.agent.domain,
        text: post.text,
        rationale: post.rationale,
        topicTitle: post.topic.title,
        sources: post.sources.map((s) => s.url),
        createdAt: post.createdAt.toISOString(),
      };
    });

    return res.status(200).json({ posts: formattedPosts });
  } catch (err) {
    logger.error('Error in /api/monitor/posts', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/monitor/agent/:id/pause
 * Pauses an agent's autonomous worker.
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
 * Resumes an agent's autonomous worker.
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
 * Deletes an agent and stops its worker.
 */
export async function handleAgentDelete(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const agent = await AgentRepository.findById(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    await autonomousWorker.stopWorkerForAgent(id);
    await AgentRepository.deleteAgent(id);
    logger.info('Agent deleted via dashboard', { agentId: id });
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('Error deleting agent', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * POST /api/monitor/agent/:id/trigger
 * Manually triggers an immediate autonomous cycle for an agent.
 */
export async function handleAgentTriggerCycle(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const agent = await AgentRepository.findById(id);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (agent.status !== 'active') return res.status(400).json({ error: 'Agent is not active' });

    // Fire and forget - don't block the response
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
