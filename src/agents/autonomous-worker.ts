import { AgentRepository } from '../database/repositories/agent-repository';
import { TopicRepository } from '../database/repositories/topic-repository';
import { DiscoveryService } from '../discovery/discovery-service';
import { EditorialEngine } from '../editorial/editorial-engine';
import { PostService } from '../publishing/post-service';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { prisma } from '../database/client';
import { geminiClient } from '../ai/gemini-client';
import { buildCompareEventSimilarityPrompt, EventSimilarityResult } from '../ai/prompts/compare-event-similarity';

export class AutonomousWorker {
  private discoveryService = new DiscoveryService();
  private editorialEngine = new EditorialEngine();
  private postService = new PostService();
  private activeWorkers = new Set<string>();
  private intervals = new Map<string, NodeJS.Timeout>();

  startWorkerForAgent(agentId: string) {
    if (this.activeWorkers.has(agentId)) {
      logger.info('Worker loop already running for agent', { agentId });
      return;
    }

    this.activeWorkers.add(agentId);
    logger.info('Starting autonomous worker loop for agent', { agentId });

    // Initial immediate execution cycle
    this.executeCycle(agentId).catch((err) => {
      logger.error('Error in initial autonomous worker cycle', { agentId }, err);
    });

    // Schedule recurring discovery & publishing loops
    const intervalMs = Math.max(1, env.AGENT_DISCOVERY_INTERVAL_MINUTES) * 60 * 1000;
    const timer = setInterval(() => {
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
    logger.info('Stopped autonomous worker loop for agent', { agentId });
  }

  async executeCycle(agentId: string) {
    const cycleId = `cycle_${Date.now()}`;
    logger.info('Autonomous cycle started', { cycleId, agentId });

    try {
      const agent = await AgentRepository.findById(agentId);
      if (!agent || agent.status !== 'active') {
        logger.info('Agent inactive or not found', { cycleId, agentId });
        return;
      }

      // Step 1: Production Research Funnel Discovery
      const discoveredCount = await this.discoveryService.runDiscoveryForAgent(agent.id);
      logger.info('Discovery stage completed', { cycleId, agentId, discoveredCount });

      // Step 2: Parallel Concurrent Editorial Evaluation (Concurrency: 4)
      const pendingTopics = await TopicRepository.getPendingTopics(agent.id, 10);
      logger.info('Evaluating pending topics concurrently in parallel', { cycleId, count: pendingTopics.length });

      const concurrency = 4;
      for (let i = 0; i < pendingTopics.length; i += concurrency) {
        const chunk = pendingTopics.slice(i, i + concurrency);
        await Promise.all(chunk.map((topic) => this.editorialEngine.evaluateTopic(agent, topic)));
      }

      // Step 3: Publishing Safeguards & Cooldowns
      const canPublish = await this.checkPublishingCooldown(agent.id);
      if (canPublish) {
        let approved = await TopicRepository.getSelectedTopics(agent.id);

        if (approved.length > 0) {
          approved.sort((a, b) => (b.score || 0) - (a.score || 0));

          // Fetch recent published posts for Final AI Anti-Collision Check
          const recentPosts = await prisma.post.findMany({
            where: { agentId: agent.id },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { topic: true },
          });

          const recentTitles = recentPosts.map((p) => p.topic?.title || p.text).filter(Boolean);

          for (const targetTopic of approved) {
            // Final AI Anti-Collision Gate: Verify topic title is not duplicate of recent published posts
            if (recentTitles.length > 0) {
              const prompt = buildCompareEventSimilarityPrompt(targetTopic.title, recentTitles);
              const check = await geminiClient.generateStructuredJson<EventSimilarityResult>(
                prompt,
                () => ({ isDuplicate: false, reason: 'Fallback default: proceed' }),
                agent.id
              );

              if (check.isDuplicate) {
                logger.warn('AI Final Anti-Collision Gate rejected duplicate topic before publishing', {
                  agentId: agent.id,
                  candidateTitle: targetTopic.title,
                  duplicateOf: check.duplicateOfTitle,
                  reason: check.reason,
                });

                await TopicRepository.updateStatus(targetTopic.id, 'rejected');
                await TopicRepository.recordDecision(
                  targetTopic.id,
                  'reject',
                  { score: targetTopic.score || 0 },
                  `AI Final Anti-Collision Gate: Duplicate event already published ("${check.duplicateOfTitle || 'Recent Story'}")`,
                  'ai-final-anti-collision-gate'
                );

                continue; // Evaluate next approved topic in queue
              }
            }

            // Target topic passed Final AI Anti-Collision Gate! Publish it now.
            logger.info('Publishing top selected topic for agent after passing AI Final Gate', {
              agentId: agent.id,
              topicId: targetTopic.id,
              title: targetTopic.title,
              score: targetTopic.score,
            });

            const decisionReason = `Selected topic with editorial score ${targetTopic.score}`;
            const publishedPost = await this.postService.generateAndPublishPost(agent, targetTopic, decisionReason);
            if (publishedPost) break; // Successfully published
          }
        } else {
          logger.info('No approved topics selected for publishing in this cycle', { cycleId, agentId });
        }
      } else {
        logger.info('Publishing skipped due to active cooldown or max daily post limits', { cycleId, agentId });
      }

      logger.info('Autonomous cycle completed successfully', { cycleId, agentId });
    } catch (err) {
      logger.error('Error in autonomous worker cycle execution', { cycleId, agentId }, err);
    }
  }

  private async checkPublishingCooldown(agentId: string): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const postsTodayCount = await prisma.post.count({
      where: {
        agentId,
        createdAt: { gte: today },
      },
    });

    if (postsTodayCount >= env.AGENT_MAX_POSTS_PER_DAY) {
      logger.info('Max daily post limit reached', { count: postsTodayCount, max: env.AGENT_MAX_POSTS_PER_DAY });
      return false;
    }

    const lastPost = await prisma.post.findFirst({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastPost) return true;

    const diffMs = Date.now() - lastPost.createdAt.getTime();
    const diffMinutes = diffMs / (1000 * 60);

    return diffMinutes >= env.AGENT_MIN_PUBLISH_INTERVAL_MINUTES;
  }
}

export const autonomousWorker = new AutonomousWorker();
