import axios from 'axios';
import { canonicalizeUrl, computeHash } from '../utils/hashing';
import { logger } from '../utils/logger';
import { NormalizedTopicItem } from './source-normalizer';
import { RssDiscovery } from './rss-discovery';
import { DiscoveryPlan, SourceStrategy } from './discovery-plan';
import { EntityRelevanceGate } from './entity-relevance-gate';
import { isJunkSourceDomain } from '../editorial/source-quality';
import { LIVE_TECH_SOURCES } from './source-registry';

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
   * High-Precision Intent-Driven Search Router.
   * Uses Google News RSS & Registered Premium RSS Feeds (TechCrunch, Wired, The Verge, BBC, NYT, CNN, NBC, etc.)
   * Filters out junk domains and routes persona-specific queries (arXiv, GitHub, HackerNews, Official RSS).
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

    // Round 1: Execute intent-routed queries & fetch registered RSS feeds
    let candidates = await this.runSearchRound(plan, interests, stats);

    // Adaptive Search Retry (Round 2) if Round 1 yields 0 candidates
    if (candidates.length === 0) {
      logger.info('Round 1 search yielded 0 candidates. Executing Round 2 adaptive query fallback via Google News', {
        targetEntity: plan.targetEntity,
      });

      roundsExecuted = 2;
      const fallbackPlan: DiscoveryPlan = {
        ...plan,
        intents: [
          {
            intentName: 'High Signal Recent News',
            category: 'news',
            queries: [
              `${plan.targetEntity} latest news 2026`,
              `${plan.targetEntity} recent announcement`,
            ],
            sourceStrategy: ['news'],
          },
        ],
      };

      candidates = await this.runSearchRound(fallbackPlan, interests, stats);
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

    // 1. Fetch from registered RSS feeds (TechCrunch, The Verge, Wired, MIT Tech Review, BBC, NYT, CNN, NBC, etc.)
    for (const source of LIVE_TECH_SOURCES) {
      stats.providersAttempted++;
      try {
        const feedItems = await this.rssDiscovery.fetchFeed(source);
        stats.providersSuccessful++;
        for (const item of feedItems) {
          if (!isJunkSourceDomain(item.canonicalUrl, item.title) && !seenUrls.has(item.canonicalUrl)) {
            seenUrls.add(item.canonicalUrl);
            rawItems.push(item);
          }
        }
      } catch (err: any) {
        stats.providersFailed++;
        stats.failedProviderDetails.push(`${source.id}: ${err.message}`);
      }
    }

    // 2. Execute intent-routed search queries
    for (const intent of plan.intents) {
      for (const query of intent.queries.slice(0, 2)) {
        for (const strategy of intent.sourceStrategy) {
          stats.providersAttempted++;
          try {
            const items = await this.executeStrategyQuery(query, strategy, plan.targetEntity);
            stats.providersSuccessful++;

            for (const item of items) {
              if (isJunkSourceDomain(item.canonicalUrl, item.title)) {
                logger.debug('Filtered junk source domain before gating', { title: item.title, url: item.canonicalUrl });
                continue;
              }

              if (!seenUrls.has(item.canonicalUrl)) {
                seenUrls.add(item.canonicalUrl);
                rawItems.push(item);
              }
            }
          } catch (err: any) {
            stats.providersFailed++;
            stats.failedProviderDetails.push(`${strategy}:${query} (${err.message})`);
            logger.warn('Provider search strategy warning', { strategy, query, err: err.message });
          }
        }
      }
    }

    // 3. Apply Hard Entity Relevance Gate
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
      case 'github':
        return this.searchGitHub(query);
      case 'research':
        return this.searchArxiv(query);
      case 'community':
        return this.searchHackerNews(query);
      case 'official':
      case 'news':
      case 'general_web':
      default:
        return this.searchGoogleNews(query);
    }
  }

  private async searchGoogleNews(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(`${query} when:3d`);
    const url = `https://news.google.com/rss/search?q=${encoded}&hl=en-IN&gl=IN&ceid=IN:en`;

    const items = await this.rssDiscovery.fetchFeed({
      id: `gnews_${query.replace(/\s+/g, '_')}`,
      name: `Google News: ${query}`,
      url,
      sourceType: 'tech_news',
    });

    return items.map((i) => ({ ...i, sourceName: i.sourceName || 'Google News', sourceType: 'news' }));
  }

  private async searchGitHub(query: string): Promise<NormalizedTopicItem[]> {
    const yesterday = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const encoded = encodeURIComponent(`${query} pushed:>${yesterday}`);
    const url = `https://api.github.com/search/repositories?q=${encoded}&sort=updated&order=desc&per_page=3`;

    try {
      const response = await axios.get(url, {
        timeout: 4000,
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
    } catch {
      return [];
    }
  }

  private async searchArxiv(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const url = `http://export.arxiv.org/api/query?search_query=all:${encoded}&sortBy=submittedDate&sortOrder=descending&max_results=3`;

    try {
      const response = await axios.get(url, { timeout: 4000 });
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
    } catch {
      return [];
    }
  }

  private async searchHackerNews(query: string): Promise<NormalizedTopicItem[]> {
    const encoded = encodeURIComponent(query);
    const url = `https://hnrss.org/newest?q=${encoded}`;
    try {
      return await this.rssDiscovery.fetchFeed({
        id: `hn_${query.replace(/\s+/g, '_')}`,
        name: `HackerNews: ${query}`,
        url,
        sourceType: 'tech_news',
      });
    } catch {
      return [];
    }
  }
}
