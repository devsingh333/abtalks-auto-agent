import { geminiClient } from '../ai/gemini-client';
import { PersonaConfig } from '../database/repositories/agent-repository';
import { logger } from '../utils/logger';

export interface TopicExpansionResult {
  queries: string[];
  subtopics: string[];
}

export class TopicExpander {
  /**
   * Expands an agent's domain & persona into high-quality discovery queries using the comprehensive prompt.
   */
  static async expandTopicToQueries(persona: PersonaConfig, agentId?: string): Promise<TopicExpansionResult> {
    const prompt = `
You are the discovery-query planner for an autonomous AI/technology research agent.

Your task is to generate high-quality web-search queries that help the agent discover
FRESH, RELEVANT, and INFORMATION-DENSE developments specifically within:

DOMAIN:
"${persona.domain}"

${persona.interests?.length
  ? `CURRENT INTERESTS:
${persona.interests.map((interest) => `- ${interest}`).join("\n")}`
  : ""}

OBJECTIVE:
Find information that has changed recently, newly emerged, or become important within
the specified domain. The queries will be sent to a live web search system, so they
must be useful as actual search queries rather than descriptions of what to search.

QUERY REQUIREMENTS:

1. DOMAIN FOCUS
   - Every query must have a clear connection to "${persona.domain}".
   - Do not drift into unrelated technology domains.
   - Use the provided interests as additional context when they improve relevance.

2. FRESHNESS
   - Prioritize recent developments, announcements, releases, research, discoveries,
     breakthroughs, updates, launches, changes, benchmarks, and significant events.
   - Prefer queries containing natural freshness signals such as:
     "latest", "recent", "new", "announced", "released", "2026", or equivalent wording
     when appropriate.
   - Do not make every query identical by simply appending "latest news".

3. QUERY DIVERSITY
   Generate complementary queries covering different discovery angles.
   For example:
   - broad recent developments
   - major announcements or releases
   - newly published research
   - important technical developments
   - emerging trends
   - notable organizations, projects, or technologies
   - practical industry developments

   Do NOT generate near-duplicate queries.

4. NATURAL SEARCH LANGUAGE
   - Write queries as a knowledgeable human researcher would actually type into a
     search engine.
   - Keep queries concise and information-dense.
   - Avoid unnecessary conversational language.
   - Do not write questions unless a question is genuinely useful for discovery.

5. DOMAIN-SPECIFIC TERMINOLOGY
   - Use terminology that naturally belongs to "${persona.domain}".
   - DO NOT inject security terminology such as:
     "vulnerability", "exploit", "advisory", "attack", "threat", or "security"
     unless "${persona.domain}" or the provided interests are explicitly security-related.
   - Do not inject research terminology such as "paper", "benchmark", or "arXiv"
     into every query unless it is appropriate for the domain.
   - Do not assume the domain is AI security merely because it is an AI-related domain.

6. SOURCE DISCOVERY
   - Queries should be broad enough to discover sources that the agent does not
     already know about.
   - Do not hardcode specific websites or organizations unless they are strongly
     implied by the domain or interests.
   - Do not restrict all queries to the same source type.

7. SIGNAL OVER VOLUME
   - Prefer queries likely to surface meaningful developments over generic content,
     opinion pieces, evergreen explainers, tutorials, or promotional material.
   - Avoid queries that primarily return old educational content.

8. SUBTOPICS
   - Return a small set of useful subtopics that represent important areas within
     the domain.
   - Subtopics must be specific enough to guide future discovery but broad enough
     to remain useful across multiple discovery cycles.
   - Do not invent unrelated subtopics.

9. OUTPUT
   - Return ONLY valid JSON.
   - Do not include Markdown.
   - Do not include explanations.
   - Do not include comments.
   - Do not include additional fields.
   - Generate 5-8 queries.
   - Generate 3-6 subtopics.
   - Each query must be unique.
   - Each subtopic must be unique.

OUTPUT FORMAT:
{
  "queries": [
    "query 1",
    "query 2",
    "query 3",
    "query 4",
    "query 5"
  ],
  "subtopics": [
    "subtopic 1",
    "subtopic 2",
    "subtopic 3"
  ]
}

QUALITY CHECK BEFORE RESPONDING:

- Is every query relevant to "${persona.domain}"?
- Do the queries collectively cover different discovery angles?
- Are they genuinely useful for finding recent information?
- Have you avoided unnecessary security terminology?
- Have you avoided near-duplicate queries?
- Could these queries discover sources the agent does not already know?
- Are the subtopics genuinely related to the domain?
- Is the response valid JSON with ONLY "queries" and "subtopics"?

Return the JSON now.
`;

    const fallback = (): TopicExpansionResult => {
      const primaryInterest = persona.interests && persona.interests.length > 0 ? persona.interests[0] : persona.domain;
      return {
        queries: [
          `${persona.domain} latest developments 2026`,
          `${persona.domain} new announcements`,
          `${primaryInterest} recent updates`,
          `${persona.domain} emerging trends`,
          `${persona.domain} major releases`,
        ],
        subtopics: [persona.domain, primaryInterest, 'Industry Trends'],
      };
    };

    try {
      const result = await geminiClient.generateStructuredJson<TopicExpansionResult>(prompt, fallback, agentId);
      logger.info('Expanded topic into dynamic search queries', {
        agentId,
        domain: persona.domain,
        queryCount: result.queries?.length || 0,
        queries: result.queries,
      });
      return result;
    } catch (err) {
      logger.error('Failed to expand topic with AI, using heuristic fallback', { agentId }, err);
      return fallback();
    }
  }
}
