import axios from 'axios';
import { canonicalizeUrl, computeHash } from '../utils/hashing';
import { logger } from '../utils/logger';
import { NormalizedTopicItem } from './source-normalizer';
import { RssDiscovery } from './rss-discovery';

export class WebSearchFetcher {
  private rssDiscovery = new RssDiscovery();

  /**
   * Searches live web, news, GitHub, arXiv, and RSS sources dynamically across 5 providers for a given set of queries.
   */
  async searchAndExtract(queries: string[]): Promise<NormalizedTopicItem[]> {
    const results: NormalizedTopicItem[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      try {
        const queryResults = await this.searchMultiProvider(query);
        for (const item of queryResults) {
          if (!seenUrls.has(item.canonicalUrl)) {
            seenUrls.add(item.canonicalUrl);
            results.push(item);
          }
        }
      } catch (err) {
        logger.warn('Multi-provider search query failed, continuing', { query, err });
      }
    }

    logger.info('Live multi-provider discovery completed', {
      queryCount: queries.length,
      extractedTotal: results.length,
    });

    return results;
  }

  private async searchMultiProvider(query: string): Promise<NormalizedTopicItem[]> {
    const providerPromises = [
      this.searchGoogleNews(query),
      this.searchGitHub(query),
      this.searchArxiv(query),
      this.searchHackerNews(query),
      this.searchDuckDuckGo(query),
    ];

    const resultsArray = await Promise.allSettled(providerPromises);
    const combined: NormalizedTopicItem[] = [];

    for (const res of resultsArray) {
      if (res.status === 'fulfilled' && res.value) {
        combined.push(...res.value);
      }
    }

    return combined;
  }

  /**
   * Provider 1: Google News Real-Time RSS Search
   */
  private async searchGoogleNews(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const googleNewsUrl = `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;

    try {
      const items = await this.rssDiscovery.fetchFeed({
        id: `gnews_${query.replace(/\s+/g, '_')}`,
        name: `Google News: ${query}`,
        url: googleNewsUrl,
        sourceType: 'tech_news',
      });

      return items.map((item) => ({
        ...item,
        sourceName: `Google News (${query})`,
        sourceType: 'news',
      }));
    } catch (err) {
      logger.debug('Google News search failed for query', { query, err });
      return [];
    }
  }

  /**
   * Provider 2: GitHub Repository & Advisory Search API
   */
  private async searchGitHub(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const githubUrl = `https://api.github.com/search/repositories?q=${encoded}&sort=updated&order=desc&per_page=5`;

    try {
      const response = await axios.get(githubUrl, {
        timeout: 6000,
        headers: {
          'User-Agent': 'ABTalks-Autonomous-Agent/1.0',
          Accept: 'application/vnd.github.v3+json',
        },
      });

      const items = response.data?.items || [];
      const normalized: NormalizedTopicItem[] = [];

      for (const item of items) {
        const canonicalUrl = canonicalizeUrl(item.html_url);
        const title = `${item.full_name}: ${item.description || 'GitHub Repository'}`;
        const summary = item.description || title;
        const contentHash = computeHash(`${title}::${summary}`);

        normalized.push({
          externalId: item.id.toString(),
          canonicalUrl,
          title,
          sourceName: 'GitHub Security & Tools',
          sourceType: 'github',
          publishedAt: new Date(item.updated_at || item.created_at),
          contentHash,
          summary,
        });
      }

      return normalized;
    } catch (err) {
      logger.debug('GitHub search failed for query', { query });
      return [];
    }
  }

  /**
   * Provider 3: arXiv Research Paper Search API
   */
  private async searchArxiv(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const arxivUrl = `http://export.arxiv.org/api/query?search_query=all:${encoded}&sortBy=submittedDate&sortOrder=descending&max_results=5`;

    try {
      const response = await axios.get(arxivUrl, { timeout: 6000 });
      const xml = response.data as string;
      const normalized: NormalizedTopicItem[] = [];

      // Parse XML entries
      const entryRegex = /<entry>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<id>([\s\S]*?)<\/id>[\s\S]*?<summary>([\s\S]*?)<\/summary>[\s\S]*?<published>([\s\S]*?)<\/published>[\s\S]*?<\/entry>/gi;
      let match;

      while ((match = entryRegex.exec(xml)) !== null) {
        const title = match[1].replace(/\s+/g, ' ').trim();
        const rawUrl = match[2].trim();
        const summary = match[3].replace(/\s+/g, ' ').trim();
        const publishedDate = new Date(match[4].trim());

        const canonicalUrl = canonicalizeUrl(rawUrl);
        const contentHash = computeHash(`${title}::${summary}`);

        normalized.push({
          externalId: canonicalUrl,
          canonicalUrl,
          title: `[arXiv Research] ${title}`,
          sourceName: 'arXiv Research Papers',
          sourceType: 'research',
          publishedAt: isNaN(publishedDate.getTime()) ? new Date() : publishedDate,
          contentHash,
          summary,
        });
      }

      return normalized;
    } catch (err) {
      logger.debug('arXiv search failed for query', { query });
      return [];
    }
  }

  /**
   * Provider 4: HackerNews Real-Time RSS Search
   */
  private async searchHackerNews(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const hnFeedUrl = `https://hnrss.org/newest?q=${encoded}`;

    try {
      const items = await this.rssDiscovery.fetchFeed({
        id: `hn_${query.replace(/\s+/g, '_')}`,
        name: `HackerNews: ${query}`,
        url: hnFeedUrl,
        sourceType: 'tech_news',
      });

      return items;
    } catch (err) {
      logger.debug('HackerNews search failed for query', { query });
      return [];
    }
  }

  /**
   * Provider 5: DuckDuckGo 24-Hour Web Search
   */
  private async searchDuckDuckGo(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encoded}&df=d`;

    try {
      const response = await axios.get(ddgUrl, {
        timeout: 6000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const html = response.data as string;
      return this.extractItemsFromHtml(html, query);
    } catch (err) {
      logger.debug('DuckDuckGo search failed for query', { query });
      return [];
    }
  }

  private extractItemsFromHtml(html: string, query: string): NormalizedTopicItem[] {
    const items: NormalizedTopicItem[] = [];
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
        sourceName: 'DuckDuckGo Live Search (24h)',
        sourceType: 'web',
        publishedAt: new Date(),
        contentHash,
        summary: snippet || title,
      });
    }

    return items;
  }
}
