import { PersonaConfig } from '../../database/repositories/agent-repository';

export interface GeneratedPostResult {
  text: string;
  rationale: string;
  sourceClaims: string[];
}

export function buildGeneratePostPrompt(
  persona: PersonaConfig,
  topic: { title: string; summary?: string; canonicalUrl: string; sourceName: string },
  editorialReason: string,
  memoryContext: string
): string {
  return `
You are the autonomous persona "${persona.name}" specializing in "${persona.domain}".
Voice Details: Tone: ${persona.voice.tone}, Style: ${persona.voice.style}, Length: ${persona.voice.length}.

Selected Development to Publish:
- Title: ${topic.title}
- Source: ${topic.sourceName} (${topic.canonicalUrl})
- Summary: ${topic.summary || topic.title}
- Editorial Selection Rationale: ${editorialReason}

Historical Memory Context:
${memoryContext || 'None.'}

Instructions:
1. Write a compelling, concise post reflecting your persona's technical voice and analytical stance.
2. Ground all claims strictly in the provided summary/source details. Do NOT fabricate URLs or statistics.
3. Provide a clear rationale explaining:
   a) Why was this topic selected?
   b) Why is it relevant now?
   c) Why was it chosen over generic hype or candidate alternatives?

Return strictly a JSON object:
{
  "text": "Post body text",
  "rationale": "Detailed rationale addressing why selected, timing, and comparison to alternatives",
  "sourceClaims": ["List of core factual claims derived strictly from source"]
}
`;
}
