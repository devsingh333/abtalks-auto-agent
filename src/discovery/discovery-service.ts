import { TopicRepository } from '../database/repositories/topic-repository';
import { AgentRepository, PersonaConfig } from '../database/repositories/agent-repository';
import { DiscoveryPlanPlanner } from './discovery-plan';
import { SearchRouter } from './search-router';
import { EventClusterer } from './event-clusterer';
import { FreshnessScorer } from '../editorial/freshness-scorer';
import { logger } from '../utils/logger';
import { NormalizedTopicItem } from './source-normalizer';

export class DiscoveryService {
  private searchRouter = new SearchRouter();

  /**
   * Executes the complete Production Research Funnel:
   * 1. Discovery Plan (Intents, Queries, Source Strategy via Gemini/NVIDIA)
   * 2. Search Router (Executes strategy-routed queries, tracking provider success vs failure, maximizing recall)
   * 3. Hard Entity Relevance Gate (Rejects irrelevant articles before LLM evaluation)
   * 4. Adaptive Search Retry (Round 2 if Round 1 produces 0 candidates)
   * 5. Event Clustering (Groups raw articles into distinct real-world events)
   * 6. Freshness & Quality Scoring
   * 7. DB Persistence for Editorial Evaluation
   */
  async runDiscoveryForAgent(agentId: string): Promise<number> {
    logger.info('Starting Production Research Funnel cycle for agent', { agentId });
    let newTopicsCount = 0;

    const agent = await AgentRepository.findById(agentId);
    if (!agent) {
      logger.warn('Agent not found for discovery cycle', { agentId });
      return 0;
    }

    const persona: PersonaConfig = JSON.parse(agent.personaConfig);

    // 1. Create Discovery Plan (LLM Planner)
    const plan = await DiscoveryPlanPlanner.createDiscoveryPlan(persona, agentId);

    // 2. Execute Search Router (Recall -> Hard Entity Relevance Gate -> Adaptive Retry)
    const searchResult = await this.searchRouter.executeDiscoveryPlan(plan, persona.interests || []);

    logger.info('Search Router execution summary', {
      agentId,
      targetEntity: plan.targetEntity,
      roundsExecuted: searchResult.roundsExecuted,
      verifiedCandidates: searchResult.candidates.length,
      providerStats: searchResult.stats,
    });

    if (searchResult.candidates.length === 0) {
      logger.info('Discovery funnel completed with 0 candidates after entity relevance gating and adaptive retries', { agentId });
      return 0;
    }

    // 3. Cluster verified candidates into unified Event Clusters
    const eventClusters = EventClusterer.clusterCandidates(searchResult.candidates);

    // 4. Score freshness, novelty, and persona fit for each event cluster
    for (const event of eventClusters) {
      const freshnessScore = FreshnessScorer.scoreEvent(event, persona);

      // Filter out low quality or low overall score events (< 4.5)
      if (freshnessScore.totalScore < 4.5) {
        logger.debug('Event cluster filtered out by freshness scorer', {
          title: event.primaryTitle,
          score: freshnessScore.totalScore,
        });
        continue;
      }

      // 5. Persist candidates belonging to approved event cluster
      for (const item of event.candidateItems) {
        const added = await this.processDiscoveredItem(agentId, item);
        if (added) newTopicsCount++;
      }
    }

    logger.info('Completed Production Research Funnel cycle for agent', {
      agentId,
      candidatesCount: searchResult.candidates.length,
      clustersCount: eventClusters.length,
      newTopicsCount,
    });

    return newTopicsCount;
  }

  private async processDiscoveredItem(agentId: string, item: NormalizedTopicItem): Promise<boolean> {
    const existing = await TopicRepository.findByCanonicalUrlOrHash(agentId, item.canonicalUrl, item.contentHash);
    if (existing) {
      return false;
    }

    await TopicRepository.createTopic({
      agentId,
      externalId: item.externalId,
      canonicalUrl: item.canonicalUrl,
      title: item.title,
      sourceName: item.sourceName,
      sourceType: item.sourceType,
      publishedAt: item.publishedAt,
      contentHash: item.contentHash,
    });

    return true;
  }
}
