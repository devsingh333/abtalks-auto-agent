import { AgentRepository } from '../database/repositories/agent-repository';
import { TopicRepository } from '../database/repositories/topic-repository';
import { PostRepository } from '../database/repositories/post-repository';
import { DiscoveryService } from '../discovery/discovery-service';
import { EditorialEngine } from '../editorial/editorial-engine';
import { PostService } from '../publishing/post-service';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { prisma } from '../database/client';
import { geminiClient } from '../ai/gemini-client';
import { buildCompareEventSimilarityPrompt, EventSimilarityResult } from '../ai/prompts/compare-event-similarity';

export interface AgentWorkerSchedule {
  intervalMinutes: number;
  status: 'active' | 'paused';
  lastRunAt: string | null;
  nextRunAt: string | null;
  stage: 'idle' | 'discovering' | 'evaluating' | 'publishing';
  isRunning: boolean;
}

export class AutonomousWorker {
  private discoveryService = new DiscoveryService();
  private editorialEngine = new EditorialEngine();
  private postService = new PostService();
  private activeWorkers = new Set<string>();
  private runningLocks = new Set<string>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private abortControllers = new Map<string, AbortController>();
  private scheduleMap = new Map<
    string,
    { lastRunAt: string; nextRunAt: string; stage: 'idle' | 'discovering' | 'evaluating' | 'publishing'; isRunning: boolean }
  >();

  getWorkerSchedule(agentId: string): AgentWorkerSchedule {
    const sched = this.scheduleMap.get(agentId);
    const isActive = this.activeWorkers.has(agentId);
    const isRunning = this.runningLocks.has(agentId) || (sched?.isRunning ?? false);
    const intervalMinutes = Math.max(1, env.AGENT_DISCOVERY_INTERVAL_MINUTES);

    if (!sched) {
      return {
        intervalMinutes,
        status: isActive ? 'active' : 'paused',
        lastRunAt: null,
        nextRunAt: null,
        stage: 'idle',
        isRunning,
      };
    }

    return {
      intervalMinutes,
      status: isActive ? 'active' : 'paused',
      lastRunAt: sched.lastRunAt,
      nextRunAt: sched.nextRunAt,
      stage: sched.stage,
      isRunning,
    };
  }

  private updateStage(
    agentId: string,
    stage: 'idle' | 'discovering' | 'evaluating' | 'publishing',
    isRunning: boolean,
    lastRunAt?: string,
    nextRunAt?: string
  ) {
    const existing = this.scheduleMap.get(agentId);
    const now = new Date();
    const intervalMs = Math.max(1, env.AGENT_DISCOVERY_INTERVAL_MINUTES) * 60 * 1000;

    this.scheduleMap.set(agentId, {
      lastRunAt: lastRunAt || existing?.lastRunAt || now.toISOString(),
      nextRunAt: nextRunAt || existing?.nextRunAt || new Date(now.getTime() + intervalMs).toISOString(),
      stage,
      isRunning,
    });
  }

  startWorkerForAgent(agentId: string) {
    if (this.activeWorkers.has(agentId)) {
      logger.info('Worker loop already registered for agent', { agentId });
      return;
    }

    const intervalMs = Math.max(1, env.AGENT_DISCOVERY_INTERVAL_MINUTES) * 60 * 1000;
    const now = new Date();
    const existing = this.scheduleMap.get(agentId);

    this.activeWorkers.add(agentId);

    // Only run initial cycle if no cycle has run yet and not already running
    const shouldRunInitial = (!existing || !existing.lastRunAt) && !this.runningLocks.has(agentId);

    const nextRun = new Date(now.getTime() + intervalMs);
    this.scheduleMap.set(agentId, {
      lastRunAt: existing?.lastRunAt || now.toISOString(),
      nextRunAt: nextRun.toISOString(),
      stage: 'idle',
      isRunning: false,
    });

    logger.info('Starting autonomous worker loop for agent', { agentId, shouldRunInitial });

    if (shouldRunInitial) {
      this.executeCycle(agentId).catch((err) => {
        logger.error('Error in initial autonomous worker cycle', { agentId }, err);
      });
    }

    // Schedule recurring 5-minute discovery & publishing loops
    const timer = setInterval(() => {
      this.executeCycle(agentId).catch((err) => {
        logger.error('Error in recurring autonomous worker cycle', { agentId }, err);
      });
    }, intervalMs);

    this.intervals.set(agentId, timer);
  }

  stopWorkerForAgent(agentId: string) {
    this.activeWorkers.delete(agentId);

    // 1. Clear recurring interval timer
    const timer = this.intervals.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.intervals.delete(agentId);
    }

    // 2. Abort any active in-flight cycle execution
    const controller = this.abortControllers.get(agentId);
    if (controller) {
      logger.info('Aborting active in-flight worker cycle execution for paused agent', { agentId });
      controller.abort();
      this.abortControllers.delete(agentId);
    }

    this.runningLocks.delete(agentId);

    const sched = this.scheduleMap.get(agentId);
    if (sched) {
      this.scheduleMap.set(agentId, { ...sched, stage: 'idle', isRunning: false });
    }
    logger.info('Stopped autonomous worker loop and aborted running cycles for agent', { agentId });
  }

  /**
   * Zero-Post Fast-Track Publishing Safeguard.
   * If an agent has 0 published posts and has approved topics in queue, instantly triggers publication.
   */
  async triggerInstantPublishIfZeroPosts(agentId: string, abortSignal?: AbortSignal): Promise<boolean> {
    if (abortSignal?.aborted) return false;

    const postCount = await prisma.post.count({ where: { agentId } });
    if (postCount > 0) return false;

    let approved = await TopicRepository.getSelectedTopics(agentId);
    if (approved.length === 0 || abortSignal?.aborted) return false;

    logger.info('⚡ Zero published posts detected with approved topics in queue — fast-tracking immediate post publication', {
      agentId,
      approvedCount: approved.length,
    });

    approved.sort((a, b) => (b.score || 0) - (a.score || 0));
    const targetTopic = approved[0];

    const agent = await AgentRepository.findById(agentId);
    if (!agent || abortSignal?.aborted) return false;

    this.updateStage(agentId, 'publishing', true);
    const decisionReason = `Fast-track zero post initialization: Selected top approved topic with score ${targetTopic.score}`;
    const post = await this.postService.generateAndPublishPost(agent, targetTopic, decisionReason);
    return post !== null;
  }

  async executeCycle(agentId: string) {
    // Lock Guard 1: Local In-Memory Lock
    if (this.runningLocks.has(agentId)) {
      logger.warn('Cycle execution blocked: Local cycle lock active for agent', { agentId });
      return;
    }

    // Lock Guard 2: Distributed Database Lease Guard (Prisma Job model)
    const activeJob = await prisma.job.findFirst({
      where: {
        agentId,
        status: 'running',
        startedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // Lease timeout 10 mins
      },
    });

    if (activeJob) {
      logger.warn('Cycle execution blocked: Distributed DB job lease active on another worker process', {
        agentId,
        jobId: activeJob.id,
      });
      return;
    }

    // Acquire Local & Distributed Lock
    this.runningLocks.add(agentId);
    const controller = new AbortController();
    this.abortControllers.set(agentId, controller);

    const intervalMs = Math.max(1, env.AGENT_DISCOVERY_INTERVAL_MINUTES) * 60 * 1000;
    const now = new Date();
    const nextRun = new Date(now.getTime() + intervalMs);

    // Create durable Prisma Job lease record in database
    let dbJobId: string | null = null;
    try {
      const dbJob = await prisma.job.create({
        data: {
          agentId,
          type: 'cycle_run',
          status: 'running',
          startedAt: now,
        },
      });
      dbJobId = dbJob.id;
    } catch (err) {
      logger.error('Failed to record Prisma Job lease in database', { agentId }, err);
    }

    const cycleId = `cycle_${Date.now()}`;
    this.updateStage(agentId, 'discovering', true, now.toISOString(), nextRun.toISOString());
    logger.info('Autonomous cycle started', { cycleId, agentId, dbJobId });

    try {
      if (controller.signal.aborted) return;

      const agent = await AgentRepository.findById(agentId);
      if (!agent || agent.status !== 'active') {
        logger.info('Agent inactive or paused', { cycleId, agentId });
        return;
      }

      // Check if zero posts exist and approved topics are already in queue
      await this.triggerInstantPublishIfZeroPosts(agent.id, controller.signal);
      if (controller.signal.aborted) return;

      // Step 1: Production Research Funnel Discovery
      this.updateStage(agentId, 'discovering', true);
      const discoveredCount = await this.discoveryService.runDiscoveryForAgent(agent.id);
      logger.info('Discovery stage completed', { cycleId, agentId, discoveredCount });

      if (controller.signal.aborted) return;

      // Step 2: Parallel Concurrent Editorial Evaluation (Concurrency: 4)
      const pendingTopics = await TopicRepository.getPendingTopics(agent.id, 10);
      if (pendingTopics.length > 0 && !controller.signal.aborted) {
        this.updateStage(agentId, 'evaluating', true);
        logger.info('Evaluating pending topics concurrently in parallel', { count: pendingTopics.length });

        const batchSize = 4;
        for (let i = 0; i < pendingTopics.length; i += batchSize) {
          if (controller.signal.aborted) break;

          const chunk = pendingTopics.slice(i, i + batchSize);
          await Promise.all(
            chunk.map(async (topic) => {
              try {
                if (!controller.signal.aborted) {
                  await this.editorialEngine.evaluateTopic(agent, topic);
                }
              } catch (err) {
                logger.error('Error in parallel topic evaluation', { agentId, topicId: topic.id }, err);
              }
            })
          );
        }
      }

      if (controller.signal.aborted) return;

      // Step 3: Publish Top Approved Selected Topic
      const selectedTopics = await TopicRepository.getSelectedTopics(agent.id);

      // STRICT EDITORIAL INTEGRITY: Rejected topics are NEVER converted to selected!
      if (selectedTopics.length === 0) {
        logger.info('No approved topics passed editorial threshold in cycle; skipping post publication', { agentId });
      } else if (!controller.signal.aborted) {
        this.updateStage(agentId, 'publishing', true);
        selectedTopics.sort((a, b) => (b.score || 0) - (a.score || 0));
        const targetTopic = selectedTopics[0];

        // Step 3.1: Final AI Anti-Collision Gate against recent 20 published posts
        const recentPosts = await PostRepository.getPostsByAgent(agent.id, 20);
        let passesAntiCollision = true;

        if (recentPosts.length > 0) {
          const recentTitles = recentPosts.map((p: any) => p.topic?.title || p.text.substring(0, 80));
          const prompt = buildCompareEventSimilarityPrompt(targetTopic.title, recentTitles);

          const similarityCheck = await geminiClient.generateStructuredJson<EventSimilarityResult>(
            prompt,
            () => ({ isDuplicate: false, similarityScore: 0, duplicateOfTitle: undefined, reason: 'Fallback pass' }),
            agent.id
          );

          if (similarityCheck.isDuplicate) {
            logger.warn('Final AI Anti-Collision Gate flagged duplicate event, rejecting topic', {
              topicId: targetTopic.id,
              duplicateOfTitle: similarityCheck.duplicateOfTitle,
              reasoning: similarityCheck.reason,
            });
            await TopicRepository.updateStatus(targetTopic.id, 'rejected');
            passesAntiCollision = false;
          }
        }

        if (passesAntiCollision && !controller.signal.aborted) {
          const decisionReason = `Selected highest scoring topic (Score: ${targetTopic.score?.toFixed(1) || 'N/A'}) matching persona requirements.`;
          await this.postService.generateAndPublishPost(agent, targetTopic, decisionReason);
        }
      }

      logger.info('Autonomous worker cycle completed successfully', { cycleId, agentId });

      // Update Prisma Job as completed
      if (dbJobId) {
        await prisma.job.update({
          where: { id: dbJobId },
          data: { status: 'completed', finishedAt: new Date() },
        }).catch(() => {});
      }
    } catch (err: any) {
      logger.error('Unhandled error during autonomous worker cycle', { cycleId, agentId }, err);
      if (dbJobId) {
        await prisma.job.update({
          where: { id: dbJobId },
          data: { status: 'failed', finishedAt: new Date(), error: err?.message || String(err) },
        }).catch(() => {});
      }
    } finally {
      this.runningLocks.delete(agentId);
      this.abortControllers.delete(agentId);

      const finishedNow = new Date();
      const nextRun = new Date(finishedNow.getTime() + intervalMs);
      this.scheduleMap.set(agentId, {
        lastRunAt: finishedNow.toISOString(),
        nextRunAt: nextRun.toISOString(),
        stage: 'idle',
        isRunning: false,
      });
    }
  }

  async restoreActiveWorkers() {
    try {
      // 1. Clean up stale running jobs in Prisma database (> 10 mins old)
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
      await prisma.job.updateMany({
        where: { status: 'running', startedAt: { lt: staleThreshold } },
        data: { status: 'failed', finishedAt: new Date(), error: 'Job lease timed out / process restarted' },
      });

      // 2. Restore background workers for all active database agents
      const activeAgents = await AgentRepository.listActiveAgents();
      logger.info(`Restoring autonomous background workers for ${activeAgents.length} active agent(s)`);

      for (const agent of activeAgents) {
        this.startWorkerForAgent(agent.id);
      }
    } catch (err) {
      logger.error('Failed to restore active agent workers on server startup', {}, err);
    }
  }
}

export const autonomousWorker = new AutonomousWorker();
