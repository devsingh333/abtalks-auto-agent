import { geminiClient } from '../ai/gemini-client';
import { PersonaConfig } from '../database/repositories/agent-repository';
import { logger } from '../utils/logger';

export interface TopicExpansionResult {
  queries: string[];
  subtopics: string[];
}

export class TopicExpander {
  /**
   * Expands an agent's domain & persona into dynamic, targeted search queries tailored 100% to its specific domain.
   */
  static async expandTopicToQueries(persona: PersonaConfig, agentId?: string): Promise<TopicExpansionResult> {
    const prompt = `You are a professional editorial curator.
Given the following agent domain and persona details, generate 2-3 concise, natural search queries to discover breaking updates, news, releases, or developments published in the LAST 24 HOURS.

Agent Domain: ${persona.domain}
Agent Identity: ${persona.identity}
Key Interests: ${persona.interests ? persona.interests.join(', ') : persona.domain}
Avoid Topics: ${persona.avoid ? persona.avoid.join(', ') : 'None'}

CRITICAL INSTRUCTIONS:
- Tailor the queries strictly to "${persona.domain}".
- DO NOT add words like "vulnerability", "advisory", "exploit", or "security" UNLESS the agent domain is explicitly security related.
- Keep queries natural and focused on what someone would search to find the latest updates for "${persona.domain}".

Return strictly JSON in the following format:
{
  "queries": [
    "${persona.domain} latest news",
    "${persona.domain} recent updates"
  ],
  "subtopics": [
    "${persona.domain}"
  ]
}`;

    const fallback = (): TopicExpansionResult => {
      const primaryInterest = persona.interests && persona.interests.length > 0 ? persona.interests[0] : persona.domain;
      return {
        queries: [
          `${persona.domain} latest news`,
          `${primaryInterest} updates`,
        ],
        subtopics: [persona.domain],
      };
    };

    try {
      const result = await geminiClient.generateStructuredJson<TopicExpansionResult>(prompt, fallback, agentId);
      logger.info('Expanded topic into dynamic search queries', {
        agentId,
        domain: persona.domain,
        queryCount: result.queries.length,
        queries: result.queries,
      });
      return result;
    } catch (err) {
      logger.error('Failed to expand topic with AI, using heuristic fallback', { agentId }, err);
      return fallback();
    }
  }
}
