import axios from 'axios';
import { canonicalizeUrl, computeHash } from '../utils/hashing';
import { logger } from '../utils/logger';
import { NormalizedTopicItem } from './source-normalizer';
import { RssDiscovery } from './rss-discovery';

export class WebSearchFetcher {
  private rssDiscovery = new RssDiscovery();

  /**
   * Searches live web/RSS sources dynamically for a given set of expanded queries.
   */
  async searchAndExtract(queries: string[]): Promise<NormalizedTopicItem[]> {
    const results: NormalizedTopicItem[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      try {
        const queryResults = await this.searchQuery(query);
        for (const item of queryResults) {
          if (!seenUrls.has(item.canonicalUrl)) {
            seenUrls.add(item.canonicalUrl);
            results.push(item);
          }
        }
      } catch (err) {
        logger.warn('Search query failed, continuing', { query, err });
      }
    }

    return results;
  }

  private async searchQuery(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const hnFeedUrl = `https://hnrss.org/newest?q=${encoded}`;
    
    try {
      const items = await this.rssDiscovery.fetchFeed({
        id: `search_${query.replace(/\s+/g, '_')}`,
        name: `Dynamic Search: ${query}`,
        url: hnFeedUrl,
        sourceType: 'tech_news',
      });

      if (items.length > 0) {
        return items;
      }
    } catch (err) {
      logger.debug('HNRSS search failed for query', { query, err });
    }

    // Fallback search via DuckDuckGo HTML Instant Answer API
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encoded}`;
      const response = await axios.get(ddgUrl, {
        timeout: 6000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const html = response.data as string;
      const extracted = this.extractItemsFromHtml(html, query);
      return extracted;
    } catch (err) {
      logger.debug('DuckDuckGo HTML fallback search failed', { query });
      return [];
    }
  }

  private extractItemsFromHtml(html: string, query: string): NormalizedTopicItem[] {
    const items: NormalizedTopicItem[] = [];
    // Regex matching DuckDuckGo result links
    const linkRegex = /<a class="result__url" href="([^"]+)".*?>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet".*?>([\s\S]*?)<\/a>/gi;

    let match;
    let count = 0;
    while ((match = linkRegex.exec(html)) !== null && count < 5) {
      count++;
      let rawUrl = match[1].trim();
      if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
      const canonicalUrl = canonicalizeUrl(rawUrl);
      
      const title = match[2].replace(/<[^>]+>/g, '').trim() || query;
      const snippet = match[3].replace(/<[^>]+>/g, '').trim();

      const contentHash = computeHash(`${title}::${snippet}`);

      items.push({
        externalId: canonicalUrl,
        canonicalUrl,
        title,
        sourceName: 'Web Search Discovery',
        sourceType: 'web',
        publishedAt: new Date(),
        contentHash,
        summary: snippet || title,
      });
    }

    return items;
  }
}

