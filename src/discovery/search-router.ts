import axios from 'axios';
import { canonicalizeUrl, computeHash } from '../utils/hashing';
import { logger } from '../utils/logger';
import { NormalizedTopicItem } from './source-normalizer';
import { RssDiscovery } from './rss-discovery';
import { DiscoveryPlan, SourceStrategy } from './discovery-plan';
import { EntityRelevanceGate } from './entity-relevance-gate';

export interface ProviderExecutionStats {
  providersAttempted: number;
  providersSuccessful: number;
  providersFailed: number;
  failedProviderDetails: string[];
}

export interface SearchRouterResult {
  candidates: NormalizedTopicItem[];
  stats: ProviderExecutionStats;
  roundsExecuted: number;
}

export class SearchRouter {
  private rssDiscovery = new RssDiscovery();

  /**
   * Routes search queries to providers according to the Discovery Plan strategies.
   * Maximizes recall first, applies hard entity relevance gate, and performs adaptive retry if needed.
   */
  async executeDiscoveryPlan(
    plan: DiscoveryPlan,
    interests: string[] = []
  ): Promise<SearchRouterResult> {
    let roundsExecuted = 1;
    let stats: ProviderExecutionStats = {
      providersAttempted: 0,
      providersSuccessful: 0,
      providersFailed: 0,
      failedProviderDetails: [],
    };

    // Round 1: Execute initial queries from plan
    let candidates = await this.runSearchRound(plan, interests, stats);

    // Adaptive Search Retry (Round 2) if Round 1 yields 0 relevant candidates
    if (candidates.length === 0) {
      logger.warn('Round 1 search produced 0 relevant candidates. Triggering Round 2 adaptive query reformulation', {
        targetEntity: plan.targetEntity,
      });

      roundsExecuted = 2;
      const reformulatedPlan: DiscoveryPlan = {
        ...plan,
        intents: plan.intents.map((intent) => ({
          ...intent,
          queries: [
            `${plan.targetEntity} latest news 2026`,
            `${plan.targetEntity} recent announcement`,
          ],
        })),
      };

      candidates = await this.runSearchRound(reformulatedPlan, interests, stats);
    }

    return {
      candidates,
      stats,
      roundsExecuted,
    };
  }

  private async runSearchRound(
    plan: DiscoveryPlan,
    interests: string[],
    stats: ProviderExecutionStats
  ): Promise<NormalizedTopicItem[]> {
    const rawItems: NormalizedTopicItem[] = [];
    const seenUrls = new Set<string>();

    for (const intent of plan.intents) {
      for (const query of intent.queries.slice(0, 2)) {
        for (const strategy of intent.sourceStrategy) {
          stats.providersAttempted++;
          try {
            const items = await this.executeStrategyQuery(query, strategy, plan.targetEntity);
            stats.providersSuccessful++;

            for (const item of items) {
              if (!seenUrls.has(item.canonicalUrl)) {
                seenUrls.add(item.canonicalUrl);
                rawItems.push(item);
              }
            }
          } catch (err: any) {
            stats.providersFailed++;
            stats.failedProviderDetails.push(`${strategy}:${query} (${err.message})`);
            logger.warn('Provider search strategy failed', { strategy, query, err: err.message });
          }
        }
      }
    }

    // Apply Hard Entity Relevance Gate immediately to raw search results (Recall -> Precision)
    const verifiedCandidates: NormalizedTopicItem[] = [];
    for (const item of rawItems) {
      const gateResult = EntityRelevanceGate.verifyRelevance(item, plan.targetEntity, interests);
      if (gateResult.passed) {
        verifiedCandidates.push(item);
      }
    }

    logger.info('Search Round execution completed', {
      targetEntity: plan.targetEntity,
      rawCount: rawItems.length,
      verifiedCount: verifiedCandidates.length,
      providersSuccessful: stats.providersSuccessful,
      providersFailed: stats.providersFailed,
    });

    return verifiedCandidates;
  }

  private async executeStrategyQuery(
    query: string,
    strategy: SourceStrategy,
    targetEntity: string
  ): Promise<NormalizedTopicItem[]> {
    switch (strategy) {
      case 'news':
        return this.searchGoogleNews(query, targetEntity);
      case 'github':
        return this.searchGitHub(query);
      case 'research':
        return this.searchArxiv(query);
      case 'community':
        return this.searchHackerNews(query);
      case 'general_web':
      default:
        return this.searchDuckDuckGo(query);
    }
  }

  private async searchGoogleNews(query: string, targetEntity: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(`${query} when:3d`);
    const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;

    const items = await this.rssDiscovery.fetchFeed({
      id: `gnews_${query.replace(/\s+/g, '_')}`,
      name: `Google News: ${query}`,
      url,
      sourceType: 'tech_news',
    });

    return items.map((i) => ({ ...i, sourceName: 'Google News', sourceType: 'news' }));
  }

  private async searchGitHub(query: string): Promise<NormalizedTopicItem[]> {
    const yesterday = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const encoded = encodeURIComponent(`${query} pushed:>${yesterday}`);
    const url = `https://api.github.com/search/repositories?q=${encoded}&sort=updated&order=desc&per_page=3`;

    const response = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'ABTalks-Agent/1.0', Accept: 'application/vnd.github.v3+json' },
    });

    const items = response.data?.items || [];
    return items.map((item: any) => ({
      externalId: item.id.toString(),
      canonicalUrl: canonicalizeUrl(item.html_url),
      title: `${item.full_name}: ${item.description || 'GitHub Repository'}`,
      sourceName: 'GitHub',
      sourceType: 'github',
      publishedAt: new Date(item.updated_at || item.created_at),
      contentHash: computeHash(`${item.full_name}::${item.description}`),
      summary: item.description || item.full_name,
    }));
  }

  private async searchArxiv(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const url = `http://export.arxiv.org/api/query?search_query=all:${encoded}&sortBy=submittedDate&sortOrder=descending&max_results=3`;

    const response = await axios.get(url, { timeout: 5000 });
    const xml = response.data as string;
    const items: NormalizedTopicItem[] = [];

    const entryRegex = /<entry>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<id>([\s\S]*?)<\/id>[\s\S]*?<summary>([\s\S]*?)<\/summary>[\s\S]*?<published>([\s\S]*?)<\/published>[\s\S]*?<\/entry>/gi;
    let match;

    while ((match = entryRegex.exec(xml)) !== null) {
      const title = match[1].replace(/\s+/g, ' ').trim();
      const rawUrl = match[2].trim();
      const summary = match[3].replace(/\s+/g, ' ').trim();
      const publishedDate = new Date(match[4].trim());

      const canonicalUrl = canonicalizeUrl(rawUrl);
      items.push({
        externalId: canonicalUrl,
        canonicalUrl,
        title: `[arXiv Research] ${title}`,
        sourceName: 'arXiv',
        sourceType: 'research',
        publishedAt: isNaN(publishedDate.getTime()) ? new Date() : publishedDate,
        contentHash: computeHash(`${title}::${summary}`),
        summary,
      });
    }

    return items;
  }

  private async searchHackerNews(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const url = `https://hnrss.org/newest?q=${encoded}`;
    return await this.rssDiscovery.fetchFeed({
      id: `hn_${query.replace(/\s+/g, '_')}`,
      name: `HackerNews: ${query}`,
      url,
      sourceType: 'tech_news',
    });
  }

  private async searchDuckDuckGo(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}&df=d`;

    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = response.data as string;
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

      items.push({
        externalId: canonicalUrl,
        canonicalUrl,
        title,
        sourceName: 'DuckDuckGo Web',
        sourceType: 'web',
        publishedAt: new Date(),
        contentHash: computeHash(`${title}::${snippet}`),
        summary: snippet || title,
      });
    }

    return items;
  }
}
