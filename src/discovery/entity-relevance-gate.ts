import { NormalizedTopicItem } from './source-normalizer';
import { logger } from '../utils/logger';

export interface GateResult {
  passed: boolean;
  reason: string;
  matchedEntities: string[];
}

export class EntityRelevanceGate {
  /**
   * Hard Entity & Domain Relevance Gate.
   * Verifies that the candidate title/snippet/URL actually contains the target entity/domain keywords.
   * Rejects immediately if the document is NOT explicitly about the target entity.
   */
  static verifyRelevance(item: NormalizedTopicItem, targetDomain: string, interests: string[] = []): GateResult {
    const textToSearch = `${item.title} ${item.summary} ${item.canonicalUrl}`.toLowerCase();
    const domainLower = targetDomain.toLowerCase().trim();

    // 1. Extract core target entity words (e.g., "marvel studios" -> ["marvel", "studios"])
    const domainWords = domainLower.split(/\s+/).filter((w) => w.length > 2);

    // 2. Check direct domain/entity match
    let directMatch = textToSearch.includes(domainLower);
    const matchedEntities: string[] = [];

    if (directMatch) {
      matchedEntities.push(domainLower);
    } else {
      // Check if at least the key noun of the domain is present
      for (const word of domainWords) {
        if (textToSearch.includes(word)) {
          matchedEntities.push(word);
        }
      }

      // Check interests as fallback entity matches
      for (const interest of interests) {
        const interestLower = interest.toLowerCase().trim();
        if (interestLower.length > 2 && textToSearch.includes(interestLower)) {
          matchedEntities.push(interestLower);
        }
      }
    }

    // Hard Gate Rule: If target entity / domain key terms are not found in the document, REJECT IMMEDIATELY
    if (matchedEntities.length === 0) {
      logger.debug('Item rejected by Hard Entity Relevance Gate', {
        title: item.title,
        targetDomain,
        matchedEntities,
      });

      return {
        passed: false,
        reason: `Document does not mention target entity "${targetDomain}" or key interests in title, summary, or URL.`,
        matchedEntities: [],
      };
    }

    return {
      passed: true,
      reason: `Matched target entity/interest terms: ${matchedEntities.join(', ')}`,
      matchedEntities,
    };
  }
}
