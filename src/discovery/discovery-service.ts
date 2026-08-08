import { LIVE_TECH_SOURCES } from './source-registry';
import { RssDiscovery } from './rss-discovery';
import { TopicRepository } from '../database/repositories/topic-repository';
import { AgentRepository, PersonaConfig } from '../database/repositories/agent-repository';
import { CandidateScorer } from '../editorial/candidate-scorer';
import { logger } from '../utils/logger';
import { NormalizedTopicItem } from './source-normalizer';

export class DiscoveryService {
  private rssFetcher = new RssDiscovery();

  async runDiscoveryForAgent(agentId: string): Promise<number> {
    logger.info('Starting discovery cycle for agent', { agentId });
    let newTopicsCount = 0;

    const agent = await AgentRepository.findById(agentId);
    if (!agent) {
      logger.warn('Agent not found for discovery cycle', { agentId });
      return 0;
    }

    const persona: PersonaConfig = JSON.parse(agent.personaConfig);

    for (const source of LIVE_TECH_SOURCES) {
      const items = await this.rssFetcher.fetchFeed(source);
      for (const item of items) {
        const added = await this.processDiscoveredItem(agentId, persona, item);
        if (added) newTopicsCount++;
      }
    }

    logger.info('Completed discovery cycle for agent', { agentId, newTopicsCount });
    return newTopicsCount;
  }

  private async processDiscoveredItem(agentId: string, persona: PersonaConfig, item: NormalizedTopicItem): Promise<boolean> {
    // 1. Check if topic already discovered for this agent
    const existing = await TopicRepository.findByCanonicalUrlOrHash(agentId, item.canonicalUrl, item.contentHash);
    if (existing) {
      return false;
    }

    // 2. Pre-filter by persona relevance to ensure each agent receives distinct topics matching its domain
    const scoreResult = CandidateScorer.calculateDeterministicScore(item, persona);
    if (scoreResult.totalScore < 4.5) {
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
