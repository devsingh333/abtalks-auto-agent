import { AgentRepository } from '../database/repositories/agent-repository';
import { TopicRepository } from '../database/repositories/topic-repository';
import { PostRepository } from '../database/repositories/post-repository';
import { DiscoveryService } from '../discovery/discovery-service';
import { EditorialEngine } from '../editorial/editorial-engine';
import { PostService } from '../publishing/post-service';
import { WorkerLock } from '../workers/worker-lock';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getHoursSince } from '../utils/dates';

export class AutonomousWorker {
  private discoveryService = new DiscoveryService();
  private editorialEngine = new EditorialEngine();
  private postService = new PostService();
  private activeIntervals: Map<string, NodeJS.Timeout> = new Map();

  async startWorkerForAgent(agentId: string) {
    if (this.activeIntervals.has(agentId)) {
      logger.info('Autonomous worker already running for agent', { agentId });
      return;
    }

    logger.info('Starting autonomous worker loop for agent', { agentId });

    // Run first cycle immediately
    setImmediate(() => this.executeCycle(agentId));

    // Schedule recurring cycles
    const intervalMs = Math.max(1, env.AGENT_DISCOVERY_INTERVAL_MINUTES) * 60 * 1000;
    const timer = setInterval(() => this.executeCycle(agentId), intervalMs);
    this.activeIntervals.set(agentId, timer);
  }

  async stopWorkerForAgent(agentId: string) {
    const timer = this.activeIntervals.get(agentId);
    if (timer) {
      clearInterval(timer);
      this.activeIntervals.delete(agentId);
      logger.info('Stopped autonomous worker for agent', { agentId });
    }
  }

  async executeCycle(agentId: string) {
    const cycleId = `cycle_${Date.now()}`;
    logger.info('Autonomous cycle started', { cycleId, agentId });

    const lock = await WorkerLock.acquire(agentId, 'autonomous_cycle');
    if (!lock) {
      logger.info('Autonomous cycle lock held by another process; skipping cycle', { cycleId, agentId });
      return;
    }

    try {
      const agent = await AgentRepository.findById(agentId);
      if (!agent || agent.status !== 'active') {
        logger.warn('Agent not found or inactive; aborting cycle', { cycleId, agentId });
        await WorkerLock.release(lock.id, true);
        return;
      }

      // Step 1: Discovery
      const discoveredCount = await this.discoveryService.runDiscoveryForAgent(agent.id);
      logger.info('Discovery stage completed', { cycleId, agentId, discoveredCount });

      // Step 2: Editorial Evaluation
      const pendingTopics = await TopicRepository.getPendingTopics(agent.id, 10);
      logger.info('Evaluating pending topics (batch limit 10)', { cycleId, count: pendingTopics.length });

      for (const topic of pendingTopics) {
        await this.editorialEngine.evaluateTopic(agent, topic);
      }

      // Step 3: Publishing Safeguards & Cooldowns
      const canPublish = await this.checkPublishingCooldown(agent.id);
      if (canPublish) {
        // Find highest scoring selected topic
        const approved = await TopicRepository.getSelectedTopics(agent.id);

        if (approved.length > 0) {
          // Sort by score descending
          approved.sort((a, b) => (b.score || 0) - (a.score || 0));
          const targetTopic = approved[0];

          logger.info('Publishing top selected topic for agent', {
            agentId: agent.id,
            topicId: targetTopic.id,
            title: targetTopic.title,
            score: targetTopic.score,
            totalSelected: approved.length,
          });

          // Fetch decision rationale
          const decisionReason = `Selected topic with editorial score ${targetTopic.score}`;
          await this.postService.generateAndPublishPost(agent, targetTopic, decisionReason);
        } else {
          logger.info('No approved topics selected for publishing in this cycle', { cycleId, agentId });
        }
      } else {
        logger.info('Publishing skipped due to active cooldown or max daily post limits', { cycleId, agentId });
      }

      await WorkerLock.release(lock.id, true);
      logger.info('Autonomous cycle completed successfully', { cycleId, agentId });
    } catch (err) {
      logger.error('Autonomous cycle encountered an error', { cycleId, agentId }, err);
      await WorkerLock.release(lock.id, false, err instanceof Error ? err.message : String(err));
    }
  }

  private async checkPublishingCooldown(agentId: string): Promise<boolean> {
    const lastPost = await PostRepository.getLastPost(agentId);
    if (!lastPost) {
      // First post for this agent: allow immediate publication
      return true;
    }

    const hoursSinceLastPost = getHoursSince(lastPost.createdAt);
    const minPublishIntervalHours = env.AGENT_MIN_PUBLISH_INTERVAL_MINUTES / 60;

    if (hoursSinceLastPost < minPublishIntervalHours) {
      logger.info('Publishing cooldown active', { agentId, hoursSinceLastPost, minPublishIntervalHours });
      return false;
    }

    // Check max posts per day limit
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentPosts = await PostRepository.getPostsInTimeframe(agentId, oneDayAgo);
    if (recentPosts.length >= env.AGENT_MAX_POSTS_PER_DAY) {
      logger.info('Max daily post limit reached', { agentId, count: recentPosts.length, max: env.AGENT_MAX_POSTS_PER_DAY });
      return false;
    }

    return true;
  }
}

export const autonomousWorker = new AutonomousWorker();
