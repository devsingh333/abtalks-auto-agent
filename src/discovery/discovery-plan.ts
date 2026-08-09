import { geminiClient } from '../ai/gemini-client';
import { PersonaConfig } from '../database/repositories/agent-repository';
import { logger } from '../utils/logger';

export type SourceStrategy = 'news' | 'general_web' | 'research' | 'github' | 'official' | 'community';

export interface SearchIntent {
  intentName: string;
  category: string;
  queries: string[];
  sourceStrategy: SourceStrategy[];
}

export interface DiscoveryPlan {
  targetEntity: string;
  intents: SearchIntent[];
  potentialExclusions: string[];
}

export class DiscoveryPlanPlanner {
  /**
   * Generates a structured Discovery Plan for an agent persona.
   */
  static async createDiscoveryPlan(persona: PersonaConfig, agentId?: string): Promise<DiscoveryPlan> {
    const prompt = `You are the discovery-query planner for an autonomous AI/technology research agent.

Generate a structured DISCOVERY PLAN to discover FRESH, RELEVANT, and INFORMATION-DENSE developments specifically for:

TARGET ENTITY / DOMAIN:
"${persona.domain}"

${persona.interests?.length ? `CURRENT INTERESTS:\n${persona.interests.map((i) => `- ${i}`).join('\n')}` : ''}

OBJECTIVE:
Create a discovery plan with 3 distinct Search Intents. Each intent should focus on a different discovery angle (e.g. Official Announcements, Technical Developments, Releases, Industry News) and provide 2-3 search queries and source strategies.

SOURCE STRATEGY OPTIONS:
- "news" (Google News, press releases)
- "general_web" (Web search, blogs, sites)
- "research" (arXiv, papers, lab posts)
- "github" (Code repositories, advisories, tools)
- "community" (HackerNews, tech discussions)

QUERY REQUIREMENTS:
- Every query must include "${persona.domain}" or a primary interest.
- DO NOT inject security terms ("vulnerability", "exploit", "advisory") unless domain is explicitly security-related.
- Do not make queries identical.

Return strictly JSON in this format:
{
  "targetEntity": "${persona.domain}",
  "intents": [
    {
      "intentName": "Official Announcements",
      "category": "announcements",
      "queries": [
        "${persona.domain} latest announcement",
        "${persona.domain} new release"
      ],
      "sourceStrategy": ["news", "general_web"]
    },
    {
      "intentName": "Recent Developments",
      "category": "developments",
      "queries": [
        "${persona.domain} recent updates 2026",
        "${persona.domain} major breakthrough"
      ],
      "sourceStrategy": ["news", "general_web"]
    }
  ],
  "potentialExclusions": ["unrelated generic explainers", "tutorials"]
}`;

    const fallback = (): DiscoveryPlan => ({
      targetEntity: persona.domain,
      intents: [
        {
          intentName: 'Official Announcements & News',
          category: 'announcements',
          queries: [
            `${persona.domain} latest news`,
            `${persona.domain} official announcement`,
          ],
          sourceStrategy: ['news', 'general_web'],
        },
        {
          intentName: 'Recent Developments & Updates',
          category: 'developments',
          queries: [
            `${persona.domain} recent updates`,
            `${persona.interests?.[0] || persona.domain} new release`,
          ],
          sourceStrategy: ['news', 'general_web'],
        },
      ],
      potentialExclusions: ['tutorials', 'evergreen explainers'],
    });

    try {
      const plan = await geminiClient.generateStructuredJson<DiscoveryPlan>(prompt, fallback, agentId);
      logger.info('Generated Discovery Plan for agent', {
        agentId,
        targetEntity: plan.targetEntity,
        intentCount: plan.intents?.length || 0,
      });
      return plan;
    } catch (err) {
      logger.error('Failed to generate Discovery Plan, using fallback', { agentId }, err);
      return fallback();
    }
  }
}
