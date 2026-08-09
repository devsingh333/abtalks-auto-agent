import { NormalizedTopicItem } from './source-normalizer';
import { logger } from '../utils/logger';

export interface EventCluster {
  id: string;
  primaryTitle: string;
  summary: string;
  canonicalUrls: string[];
  sources: string[];
  candidateItems: NormalizedTopicItem[];
  eventDate: Date;
}

export class EventClusterer {
  /**
   * Clusters a list of normalized topic items into unified event clusters based on token overlap.
   */
  static clusterCandidates(items: NormalizedTopicItem[]): EventCluster[] {
    const clusters: EventCluster[] = [];

    for (const item of items) {
      const itemTokens = this.tokenize(item.title);
      let matchedCluster: EventCluster | null = null;

      for (const cluster of clusters) {
        const clusterTokens = this.tokenize(cluster.primaryTitle);
        const similarity = this.jaccardSimilarity(itemTokens, clusterTokens);

        // If similarity >= 0.4 or titles share key proper nouns, group into cluster
        if (similarity >= 0.4) {
          matchedCluster = cluster;
          break;
        }
      }

      if (matchedCluster) {
        matchedCluster.candidateItems.push(item);
        if (!matchedCluster.canonicalUrls.includes(item.canonicalUrl)) {
          matchedCluster.canonicalUrls.push(item.canonicalUrl);
        }
        if (!matchedCluster.sources.includes(item.sourceName)) {
          matchedCluster.sources.push(item.sourceName);
        }
      } else {
        clusters.push({
          id: `event_${(item.contentHash || '').slice(0, 12)}`,
          primaryTitle: item.title,
          summary: item.title,
          canonicalUrls: [item.canonicalUrl],
          sources: [item.sourceName],
          candidateItems: [item],
          eventDate: item.publishedAt || new Date(),
        });
      }
    }

    logger.info('Clustered candidate topics into event clusters', {
      rawCount: items.length,
      clusterCount: clusters.length,
    });

    return clusters;
  }

  private static tokenize(text: string): Set<string> {
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    return new Set(words);
  }

  private static jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
    let intersection = 0;
    for (const elem of setA) {
      if (setB.has(elem)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
