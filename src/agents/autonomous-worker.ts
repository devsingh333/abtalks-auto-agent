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
  isRunning: boolean;
}

export class AutonomousWorker {
  private discoveryService = new DiscoveryService();
  private editorialEngine = new EditorialEngine();
  private postService = new PostService();
  private activeWorkers = new Set<string>();
  private intervals = new Map<string, NodeJS.Timeout>();
  private scheduleMap = new Map<string, { lastRunAt: string; nextRunAt: string; isRunning: boolean }>();

  getWorkerSchedule(agentId: string): AgentWorkerSchedule {
    const sched = this.scheduleMap.get(agentId);
    const isActive = this.activeWorkers.has(agentId);
    const intervalMinutes = Math.max(1, env.AGENT_DISCOVERY_INTERVAL_MINUTES);

    if (!sched) {
      return {
        intervalMinutes,
        status: isActive ? 'active' : 'paused',
        lastRunAt: null,
        nextRunAt: null,
        isRunning: false,
      };
    }

    return {
      intervalMinutes,
      status: isActive ? 'active' : 'paused',
      lastRunAt: sched.lastRunAt,
      nextRunAt: sched.nextRunAt,
      isRunning: sched.isRunning,
    };
  }

  startWorkerForAgent(agentId: string) {
    if (this.activeWorkers.has(agentId)) {
      logger.info('Worker loop already running for agent', { agentId });
      return;
    }

    const intervalMs = Math.max(1, env.AGENT_DISCOVERY_INTERVAL_MINUTES) * 60 * 1000;
    const now = new Date();
    const nextRun = new Date(now.getTime() + intervalMs);

    this.activeWorkers.add(agentId);
    this.scheduleMap.set(agentId, {
      lastRunAt: now.toISOString(),
      nextRunAt: nextRun.toISOString(),
      isRunning: false,
    });

    logger.info('Starting autonomous worker loop for agent', { agentId });

    // Initial immediate execution cycle
    this.executeCycle(agentId).catch((err) => {
      logger.error('Error in initial autonomous worker cycle', { agentId }, err);
    });

    // Schedule recurring discovery & publishing loops
    const timer = setInterval(() => {
      const cycleNow = new Date();
      const cycleNext = new Date(cycleNow.getTime() + intervalMs);

      const existing = this.scheduleMap.get(agentId);
      this.scheduleMap.set(agentId, {
        lastRunAt: cycleNow.toISOString(),
        nextRunAt: cycleNext.toISOString(),
        isRunning: existing?.isRunning || false,
      });

      this.executeCycle(agentId).catch((err) => {
        logger.error('Error in recurring autonomous worker cycle', { agentId }, err);
      });
    }, intervalMs);

    this.intervals.set(agentId, timer);
  }

  stopWorkerForAgent(agentId: string) {
    this.activeWorkers.delete(agentId);
    const timer = this.intervals.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.intervals.delete(agentId);
    }
    const sched = this.scheduleMap.get(agentId);
    if (sched) {
      this.scheduleMap.set(agentId, { ...sched, isRunning: false });
    }
    logger.info('Stopped autonomous worker loop for agent', { agentId });
  }

  /**
   * Zero-Post Fast-Track Publishing Safeguard.
   * If an agent has 0 published posts and has approved topics in queue, instantly triggers publication.
   */
  async triggerInstantPublishIfZeroPosts(agentId: string): Promise<boolean> {
    const postCount = await prisma.post.count({ where: { agentId } });
    if (postCount > 0) return false;

    let approved = await TopicRepository.getSelectedTopics(agentId);
    if (approved.length === 0) return false;

    logger.info('⚡ Zero published posts detected with approved topics in queue — fast-tracking immediate post publication', {
      agentId,
      approvedCount: approved.length,
    });

    approved.sort((a, b) => (b.score || 0) - (a.score || 0));
    const targetTopic = approved[0];

    const agent = await AgentRepository.findById(agentId);
    if (!agent) return false;

    const decisionReason = `Fast-track zero post initialization: Selected top approved topic with score ${targetTopic.score}`;
    const post = await this.postService.generateAndPublishPost(agent, targetTopic, decisionReason);
    return post !== null;
  }

  async executeCycle(agentId: string) {
    const cycleId = `cycle_${Date.now()}`;
    const existingSched = this.scheduleMap.get(agentId);
    const intervalMs = Math.max(1, env.AGENT_DISCOVERY_INTERVAL_MINUTES) * 60 * 1000;
    const now = new Date();

    this.scheduleMap.set(agentId, {
      lastRunAt: existingSched?.lastRunAt || now.toISOString(),
      nextRunAt: existingSched?.nextRunAt || new Date(now.getTime() + intervalMs).toISOString(),
      isRunning: true,
    });

    logger.info('Autonomous cycle started', { cycleId, agentId });

    try {
      const agent = await AgentRepository.findById(agentId);
      if (!agent || agent.status !== 'active') {
        logger.info('Agent inactive or not found', { cycleId, agentId });
        return;
      }

      // Check if zero posts exist and approved topics are already in queue
      await this.triggerInstantPublishIfZeroPosts(agent.id);

      // Step 1: Production Research Funnel Discovery
      const discoveredCount = await this.discoveryService.runDiscoveryForAgent(agent.id);
      logger.info('Discovery stage completed', { cycleId, agentId, discoveredCount });

      // Step 2: Parallel Concurrent Editorial Evaluation (Concurrency: 4)
      const pendingTopics = await TopicRepository.getPendingTopics(agent.id, 10);
      if (pendingTopics.length > 0) {
        logger.info('Evaluating pending topics concurrently in parallel', { count: pendingTopics.length });

        const batchSize = 4;
        for (let i = 0; i < pendingTopics.length; i += batchSize) {
          const chunk = pendingTopics.slice(i, i + batchSize);
          await Promise.all(
            chunk.map(async (topic) => {
              try {
                await this.editorialEngine.evaluateTopic(agent, topic);
              } catch (err) {
                logger.error('Error in parallel topic evaluation', { agentId, topicId: topic.id }, err);
              }
            })
          );
        }
      }

      // Step 3: Publish Top Approved Selected Topic
      let selectedTopics = await TopicRepository.getSelectedTopics(agent.id);

      // Autonomous Second-Pass Safeguard: If zero topics passed minimum threshold, select highest scoring discovered topic
      if (selectedTopics.length === 0) {
        logger.warn('Zero topics passed editorial threshold in cycle; invoking autonomous fallback review', { agentId });
        const topEvaluated = await prisma.topic.findFirst({
          where: { agentId: agent.id, status: 'rejected', score: { gte: 5.0 } },
          orderBy: { score: 'desc' },
        });

        if (topEvaluated) {
          logger.info('Safeguard selected top rejected topic for publication', { topicId: topEvaluated.id, score: topEvaluated.score });
          await TopicRepository.updateStatus(topEvaluated.id, 'selected');
          selectedTopics = [topEvaluated];
        }
      }

      if (selectedTopics.length > 0) {
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
            () => ({ isDuplicate: false, similarityScore: 0, matchedTitle: null, reason: 'Fallback pass' }),
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

        if (passesAntiCollision) {
          const decisionReason = `Selected highest scoring topic (Score: ${targetTopic.score?.toFixed(1) || 'N/A'}) matching persona requirements.`;
          await this.postService.generateAndPublishPost(agent, targetTopic, decisionReason);
        }
      }

      logger.info('Autonomous worker cycle completed successfully', { cycleId, agentId });
    } catch (err) {
      logger.error('Unhandled error during autonomous worker cycle', { cycleId, agentId }, err);
    } finally {
      const endSched = this.scheduleMap.get(agentId);
      if (endSched) {
        this.scheduleMap.set(agentId, { ...endSched, isRunning: false });
      }
    }
  }

  async restoreActiveWorkers() {
    try {
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
