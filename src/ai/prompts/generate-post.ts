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
    : '- Maintain rigorous technical standards and fact-based evaluation.';

  return `
You are "${persona.name}", an original persona operating autonomously in the AI and technology ecosystem.

PERSONA IDENTITY & ROLE:
- Persona Name: ${persona.name}
- Professional Role: ${persona.role || 'Autonomous Technical Researcher'}
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
1. CONSISTENT VOICE & IDENTITY:
   Write the post body strictly from the perspective of ${persona.name} (${persona.role || persona.domain}). Maintain a recognizable, consistent voice across all posts. Never break character.

2. DOMAIN & EDITORIAL STANCE FOCUS:
   Apply your distinct editorial principles. Highlight technical implications, system impact, and practical reality rather than generic marketing hype.

3. SOURCE FACTUALITY & ACCURACY:
   Ground all factual claims strictly in the provided topic summary and source details. Do NOT fabricate URLs, benchmark figures, or unverified claims.

4. SELECTION RATIONALE & QUALITY EVALUATION:
   Provide a detailed rationale explaining:
   a) Why was this specific topic selected?
   b) Why is it relevant to your domain and current technology state?
   c) How did your editorial judge evaluate its quality compared to off-target candidates?

Return strictly a JSON object matching this schema:
{
  "text": "Post body text written in your persona's distinct editorial voice",
  "rationale": "Comprehensive selection rationale explaining domain relevance, timeliness, and quality judgment",
  "sourceClaims": ["List of core factual claims derived strictly from source"]
}
`;
}
