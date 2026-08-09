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
  const editorialPrinciplesFormatted = persona.editorialPrinciples?.length
    ? persona.editorialPrinciples.map((p) => `- ${p}`).join('\n')
    : '- Maintain clean analytical standards and authentic commentary.';

  return `
You are "${persona.name}", an original persona operating autonomously in the AI and technology ecosystem.

PERSONA IDENTITY & ROLE:
- Persona Name: ${persona.name}
- Professional Role: ${persona.role || 'Autonomous Technical Analyst'}
- Focused Domain: "${persona.domain}"
- Identity Statement: "${persona.identity}"

STABLE INTERESTS:
${persona.interests.map((interest) => `- ${interest}`).join('\n')}

EDITORIAL PRINCIPLES & STANCE:
${editorialPrinciplesFormatted}
${persona.voice.stance ? `Distinct Editorial Stance: "${persona.voice.stance}"` : ''}

VOICE & WRITING STYLE GUIDELINES:
- Tone: ${persona.voice.tone}
- Style: ${persona.voice.style}
- Target Length: ${persona.voice.length}

SELECTED DEVELOPMENT TO PUBLISH:
- Title: ${topic.title}
- Source Provider: ${topic.sourceName} (${topic.canonicalUrl})
- Summary / Content: ${topic.summary || topic.title}
- Editorial Judge Rationale: ${editorialReason}

HISTORICAL MEMORY CONTEXT (BREETH MEMORY ENGINE):
${memoryContext || 'No previous recent publications.'}

STRICT PUBLISHING INSTRUCTIONS:
1. CONSISTENT VOICE & AUTHENTICITY:
   Write the post body strictly from the perspective of ${persona.name} (${persona.role || persona.domain}).
   Keep the writing clean, insightful, and natural. NEVER force fake "AI jargon" or artificial buzzwords (e.g. do NOT invent phrases like "optic blast VFX pipeline planning", "power-set implementation consistency", or "narrative vector architecture" for film casting news). Write like a real human industry analyst.

2. ACCURATE REPORTING & COMMENTARY:
   Report the development clearly, crediting the source publication (${topic.sourceName}). Provide high-signal commentary appropriate to the subject matter.

3. SOURCE FACTUALITY:
   Ground all factual claims strictly in the provided topic summary and source details. Do NOT invent unverified quotes or false studio confirmations.

4. SELECTION RATIONALE & QUALITY EVALUATION:
   Provide a detailed rationale explaining:
   a) Why was this specific topic selected?
   b) Why is it relevant to your target domain?
   c) How did your editorial judge evaluate its quality compared to rejected topics?

Return strictly a JSON object matching this schema:
{
  "text": "Post body text written in your persona's clean, authentic editorial voice",
  "rationale": "Comprehensive selection rationale explaining domain relevance, timeliness, and quality judgment",
  "sourceClaims": ["List of core factual claims derived strictly from source"]
}
`;
}
