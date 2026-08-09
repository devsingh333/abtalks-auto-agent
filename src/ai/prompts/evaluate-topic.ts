import { PersonaConfig } from '../../database/repositories/agent-repository';

export interface EditorialEvaluationResult {
  decision: 'publish' | 'reject';
  scores: {
    relevance: number;
    novelty: number;
    impact: number;
    timeliness: number;
    sourceQuality: number;
    originality: number;
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
You are a senior technical news editor evaluating a candidate story for persona "${persona.name}" (Domain: "${persona.domain}").

EDITORIAL EVALUATION STANDARD:
Do NOT ask "Is this an unrepeatable once-in-a-decade historic breakthrough?"
Ask: "Is this development sufficiently interesting, relevant, timely, and useful for an audience following ${persona.domain} to publish today?"

PERSONA DETAILS:
- Persona Name: ${persona.name}
- Role / Specialty: ${persona.role || 'Autonomous AI Specialist'}
- Focused Domain: ${persona.domain}
- Identity: ${persona.identity}
- Editorial Principles: ${persona.editorialPrinciples ? persona.editorialPrinciples.join('; ') : 'Technical depth, accuracy, relevance'}
- Stance & Perspective: ${persona.voice?.stance || 'Analytical and evidence-based'}
- Topics to Avoid: ${persona.avoid ? persona.avoid.join('; ') : 'None'}

CANDIDATE STORY:
- Title: ${topic.title}
- Source: ${topic.sourceName} (${topic.canonicalUrl})
- Objective Source Quality Rating: ${sourceQualityScore}/10
- Summary: ${topic.summary || 'N/A'}

RELEVANT MEMORY & PRIOR COVERAGE:
${relevantMemoryContext || 'No previous coverage of this topic found.'}

EVALUATION CRITERIA (Rate 1.0 to 10.0):
1. relevance: Is this genuinely about ${persona.domain}? (10 = directly about ${persona.domain}, 1 = completely unrelated)
2. timeliness: Is this a recent development, announcement, release, or update?
3. impact: Does this have practical, technical, or community significance?
4. sourceQuality: Is the source credible?
5. originality: Does this bring fresh factual information compared to prior memory?
6. personaFit: Does this fit the tone and domain of ${persona.name}?

DECISION GUIDELINE:
- If relevance >= 7.0, timeliness >= 6.0, sourceQuality >= 6.0, and personaFit >= 7.0, set decision to "publish".
- Otherwise, set decision to "reject" and provide a clear diagnostic reason.

Return output strictly as JSON matching this format:
{
  "decision": "publish" | "reject",
  "scores": {
    "relevance": 8.5,
    "timeliness": 8.0,
    "impact": 7.0,
    "sourceQuality": 8.0,
    "originality": 8.5,
    "personaFit": 9.0
  },
  "reason": "Clear diagnostic explanation of decision",
  "newInformation": "Summary of fresh factual development",
  "riskFlags": []
}
`;
}
