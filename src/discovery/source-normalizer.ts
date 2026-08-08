import { canonicalizeUrl, computeHash } from '../utils/hashing';

export interface RawFeedItem {
  guid?: string;
  link?: string;
  title?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  summary?: string;
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
  static normalizeItem(item: RawFeedItem, sourceName: string, sourceType: string): NormalizedTopicItem | null {
    const rawUrl = item.link || item.guid;
    const title = item.title?.trim();

    if (!rawUrl || !title) {
      return null;
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
