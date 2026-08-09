import Parser from 'rss-parser';
import { FeedSource } from './source-registry';
import { SourceNormalizer, NormalizedTopicItem } from './source-normalizer';
import { logger } from '../utils/logger';

export class RssDiscovery {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      customFields: {
        item: ['source'],
      },
    });
  }

  async fetchFeed(source: FeedSource): Promise<NormalizedTopicItem[]> {
    try {
      const feed = await this.parser.parseURL(source.url);
      const items: NormalizedTopicItem[] = [];

      for (const item of feed.items) {
        const normalized = SourceNormalizer.normalizeItem(item, source.name, source.sourceType);
        if (normalized) {
          items.push(normalized);
        }
      }

      logger.info('Fetched RSS feed successfully', { source: source.name, count: items.length });
      return items;
    } catch (err) {
      const message = (err as Error)?.message || String(err);
      logger.warn('Failed to fetch RSS feed, continuing without crashing', { source: source.name, url: source.url, message });
      return [];
    }
  }
}
