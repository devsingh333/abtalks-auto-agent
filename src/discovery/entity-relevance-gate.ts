import { NormalizedTopicItem } from './source-normalizer';
import { EntityGraph } from './entity-graph';
import { logger } from '../utils/logger';

export interface GateResult {
  passed: boolean;
  reason: string;
  matchedEntities: string[];
}

export class EntityRelevanceGate {
  /**
   * Hard Entity & Domain Relevance Gate.
   * Uses EntityGraph to verify that title, summary, or URL mentions the target entity, sub-entities, aliases, or key figures.
   * Rejects immediately if the document is NOT explicitly about the target domain/entity.
   */
  static verifyRelevance(item: NormalizedTopicItem, targetDomain: string, interests: string[] = []): GateResult {
    const textToSearch = `${item.title} ${item.summary} ${item.canonicalUrl}`.toLowerCase();
    const entityKeywords = EntityGraph.getEntityKeywords(targetDomain, interests);

    const matchedEntities: string[] = [];

    for (const keyword of entityKeywords) {
      if (textToSearch.includes(keyword)) {
        matchedEntities.push(keyword);
      }
    }

    if (matchedEntities.length === 0) {
      logger.debug('Item rejected by Hard Entity Relevance Gate', {
        title: item.title,
        targetDomain,
        matchedEntities,
      });

      return {
        passed: false,
        reason: `Document does not mention target entity "${targetDomain}" or its known aliases/sub-entities.`,
        matchedEntities: [],
      };
    }

    return {
      passed: true,
      reason: `Matched target entity keywords: ${matchedEntities.slice(0, 3).join(', ')}`,
      matchedEntities,
    };
  }
}
