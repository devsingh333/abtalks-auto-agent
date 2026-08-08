import { PersonaConfig } from '../../database/repositories/agent-repository';

export interface EditorialEvaluationResult {
  decision: 'publish' | 'reject';
  scores: {
    relevance: number;
    novelty: number;
    impact: number;
    timeliness: number;
    sourceQuality: number;
    personaFit: number;
  };
  reason: string;
  newInformation: string;
  riskFlags: string[];
}

export function buildEvaluateTopicPrompt(
  persona: PersonaConfig,
  topic: { title: string; summary?: string; sourceName: string; canonicalUrl: string },
  sourceQualityScore: number,
  relevantMemoryContext: string
): string {
  return `
You are an expert editorial evaluator acting as persona "${persona.name}" in domain "${persona.domain}".
Persona Identity: ${persona.identity}
Persona Editorial Principles: ${persona.editorialPrinciples.join('; ')}
Persona Avoid Topics: ${persona.avoid.join('; ')}

Candidate Topic to Evaluate:
- Title: ${topic.title}
- Source: ${topic.sourceName} (${topic.canonicalUrl})
- Objective Source Quality Rating (1-10): ${sourceQualityScore}
- Summary/Content Snippet: ${topic.summary || 'N/A'}

Relevant Previous Persona Memory & Publications:
${relevantMemoryContext || 'None found.'}

Task:
Evaluate whether this topic should be published or rejected by the persona.
Rate each dimension from 1 to 10:
- relevance (fit to persona domain)
- novelty (is this new vs past memory)
- impact (technical significance)
- timeliness (recent development)
- sourceQuality (credibility)
- personaFit (aligns with editorial stance)

Return output strictly as a single JSON object matching this TypeScript format:
{
  "decision": "publish" | "reject",
  "scores": {
    "relevance": number,
    "novelty": number,
    "impact": number,
    "timeliness": number,
    "sourceQuality": number,
    "personaFit": number
  },
  "reason": "Detailed string explaining why selected or rejected over other candidates",
  "newInformation": "String summarizing what exact new factual development is brought by this item",
  "riskFlags": string[]
}
`;
}
