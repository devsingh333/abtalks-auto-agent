import { canonicalizeUrl, computeHash } from '../utils/hashing';

export interface RawFeedItem {
  guid?: string;
  link?: string;
  title?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  summary?: string;
  source?: any;
}

export interface NormalizedTopicItem {
  externalId: string;
  canonicalUrl: string;
  title: string;
  sourceName: string;
  sourceType: string;
  publishedAt: Date | null;
  contentHash: string;
  summary: string;
}

export class SourceNormalizer {
  static normalizeItem(item: RawFeedItem, defaultSourceName: string, sourceType: string): NormalizedTopicItem | null {
    let rawUrl = item.link || item.guid;
    const title = item.title?.trim();

    if (!rawUrl || !title) {
      return null;
    }

    let sourceName = defaultSourceName;

    // Google News & RSS <source url="https://www.gsmarena.com">GSMArena.com</source> extraction
    if (item.source) {
      let publisherUrl: string | undefined;
      let publisherName: string | undefined;

      if (typeof item.source === 'object') {
        publisherUrl = item.source.$?.url || item.source.url;
        publisherName = item.source._ || item.source.title || item.source.name;
      } else if (typeof item.source === 'string') {
        publisherName = item.source;
      }

      if (publisherUrl && (rawUrl.includes('news.google.com') || rawUrl.includes('rss'))) {
        rawUrl = publisherUrl;
      }

      if (publisherName) {
        sourceName = `${defaultSourceName} (${publisherName})`;
      }
    }

    const canonicalUrl = canonicalizeUrl(rawUrl);
    const summary = item.contentSnippet || item.summary || title;
    const contentHash = computeHash(`${title}::${summary}`);

    let publishedAt: Date | null = null;
    if (item.isoDate || item.pubDate) {
      const parsed = new Date(item.isoDate || item.pubDate || '');
      if (!isNaN(parsed.getTime())) {
        publishedAt = parsed;
      }
    }

    return {
      externalId: item.guid || canonicalUrl,
      canonicalUrl,
      title,
      sourceName,
      sourceType,
      publishedAt,
      contentHash,
      summary,
    };
  }
}
