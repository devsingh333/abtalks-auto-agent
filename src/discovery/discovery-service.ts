import { LIVE_TECH_SOURCES } from './source-registry';
import { RssDiscovery } from './rss-discovery';
import { TopicRepository } from '../database/repositories/topic-repository';
import { AgentRepository, PersonaConfig } from '../database/repositories/agent-repository';
import { TopicExpander } from './topic-expander';
import { WebSearchFetcher } from './web-search-fetcher';
import { EventClusterer } from './event-clusterer';
import { FreshnessScorer } from '../editorial/freshness-scorer';
import { logger } from '../utils/logger';
import { NormalizedTopicItem } from './source-normalizer';

export class DiscoveryService {
  private rssFetcher = new RssDiscovery();
  private webFetcher = new WebSearchFetcher();

  /**
   * Executes Topic-Driven Adaptive Discovery for an agent:
   * 1. Expands agent domain into dynamic search queries (LLM).
   * 2. Searches live web sources & RSS feeds dynamically.
   * 3. Fetches, normalizes, and deduplicates content.
   * 4. Clusters candidate pages by event.
   * 5. Scores freshness, source quality, and persona fit.
   * 6. Persists approved topics into database.
   */
  async runDiscoveryForAgent(agentId: string): Promise<number> {
    logger.info('Starting Topic-Driven Adaptive Discovery cycle for agent', { agentId });
    let newTopicsCount = 0;

    const agent = await AgentRepository.findById(agentId);
    if (!agent) {
      logger.warn('Agent not found for discovery cycle', { agentId });
      return 0;
    }

    const persona: PersonaConfig = JSON.parse(agent.personaConfig);

    // Step A: Topic Expansion using Gemini/LLM
    const expansion = await TopicExpander.expandTopicToQueries(persona, agentId);
    logger.info('Topic expansion generated queries', { agentId, queries: expansion.queries });

    // Step B: Search live sources dynamically using expanded queries (strictly past 24h)
    const searchItems = await this.webFetcher.searchAndExtract(expansion.queries);

    // Enforce 24-hour cutoff
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const freshCandidates = searchItems.filter(
      (item) => item.publishedAt && item.publishedAt >= twentyFourHoursAgo
    );

    // Step C & D: Normalize and cluster into events
    const eventClusters = EventClusterer.clusterCandidates(freshCandidates);

    // Step E: Score freshness, novelty, and persona fit for each event cluster
    for (const event of eventClusters) {
      const freshnessScore = FreshnessScorer.scoreEvent(event, persona);

      // Filter out low quality or irrelevant events (< 4.5)
      if (freshnessScore.totalScore < 4.5) {
        logger.debug('Event cluster filtered out by freshness scorer', {
          title: event.primaryTitle,
          score: freshnessScore.totalScore,
        });
        continue;
      }

      // Persist the primary candidate item for this event cluster
      for (const item of event.candidateItems) {
        const added = await this.processDiscoveredItem(agentId, persona, item, freshnessScore.totalScore);
        if (added) newTopicsCount++;
      }
    }

    logger.info('Completed Topic-Driven Adaptive Discovery cycle for agent', {
      agentId,
      discoveredCount: freshCandidates.length,
      clustersCount: eventClusters.length,
      newTopicsCount,
    });

    return newTopicsCount;
  }

  private async processDiscoveredItem(
    agentId: string,
    persona: PersonaConfig,
    item: NormalizedTopicItem,
    calculatedScore: number
  ): Promise<boolean> {
    // 1. Check if topic already discovered for this agent
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
