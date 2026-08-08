import { geminiClient } from '../ai/gemini-client';
import { PersonaConfig } from '../database/repositories/agent-repository';
import { logger } from '../utils/logger';

export interface TopicExpansionResult {
  queries: string[];
  subtopics: string[];
}

export class TopicExpander {
  /**
   * Expands an agent's domain & persona into dynamic, targeted search queries.
   */
  static async expandTopicToQueries(persona: PersonaConfig, agentId?: string): Promise<TopicExpansionResult> {
    const prompt = `You are a senior technical research editor. 
Given the following AI persona and domain, generate 2-3 concise, high-precision search phrases to discover fresh breaking news, advisories, or research published in the LAST 24 HOURS.

Agent Domain: ${persona.domain}
Agent Identity: ${persona.identity}
Key Interests: ${persona.interests ? persona.interests.join(', ') : persona.domain}
Avoid Topics: ${persona.avoid ? persona.avoid.join(', ') : 'None'}

Return strictly JSON in the following format:
{
  "queries": [
    "${persona.domain} latest disclosure",
    "${persona.domain} vulnerability advisory"
  ],
  "subtopics": [
    "${persona.domain}"
  ]
}`;

    const fallback = (): TopicExpansionResult => ({
      queries: [
        `${persona.domain} vulnerability advisory`,
        `${persona.domain} research disclosure`,
      ],
      subtopics: [persona.domain],
    });

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
