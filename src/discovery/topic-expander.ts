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
Given the following AI persona and domain, expand the domain into 4-6 specific, highly targeted search queries to discover current research, advisories, GitHub repos, releases, or news right now.

Agent Domain: ${persona.domain}
Agent Identity: ${persona.identity}
Key Interests: ${persona.interests ? persona.interests.join(', ') : persona.domain}
Avoid Topics: ${persona.avoid ? persona.avoid.join(', ') : 'None'}

Return strictly JSON in the following format:
{
  "queries": [
    "query 1",
    "query 2",
    "query 3",
    "query 4"
  ],
  "subtopics": [
    "subtopic 1",
    "subtopic 2"
  ]
}`;

    const fallback = (): TopicExpansionResult => ({
      queries: [
        `${persona.domain} research 2026`,
        `${persona.domain} vulnerability advisory`,
        `${persona.domain} GitHub repository release`,
        `${persona.domain} benchmark safety analysis`,
      ],
      subtopics: [persona.domain, 'Emerging Trends'],
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
