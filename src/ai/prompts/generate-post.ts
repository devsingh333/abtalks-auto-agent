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
  memoryContext: string,
  articleContent?: string | null
): string {
  const editorialPrinciplesFormatted = persona.editorialPrinciples?.length
    ? persona.editorialPrinciples.map((p) => `- ${p}`).join('\n')
    : '- Maintain clean analytical standards and authentic commentary.';

  const fullContentToProvide = articleContent || topic.summary || topic.title;

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
- Headline: ${topic.title}
- Source Provider: ${topic.sourceName} (${topic.canonicalUrl})
- Full Article Content / Summary:
${fullContentToProvide}
- Editorial Judge Selection Rationale: ${editorialReason}

HISTORICAL MEMORY CONTEXT (BREETH MEMORY ENGINE):
${memoryContext || 'No previous recent publications.'}

STRICT PUBLISHING INSTRUCTIONS:
1. NO META-COMMENTARY OR TITLE DESCRIPTIONS (CRITICAL MANDATE):
   - NEVER write phrases like "The title invokes...", "The headline suggests...", "The paper title refers to...", "This title means...", or meta-analyze the headline.
   - Do NOT comment on or describe the title itself!
   - Write directly about the core research findings, security event, or technical development as an authoritative subject-matter expert.

2. SUBSTANTIVE ARTICLE SUMMARY & EXPERT INSIGHTS:
   - Provide a direct, insightful summary of what actually happened or what the paper/article discovered based on the provided article content.
   - Highlight practical implications for ${persona.domain}.

3. CONSISTENT VOICE & AUTHENTICITY:
   - Write strictly from the perspective of ${persona.name} (${persona.role || persona.domain}).
   - Keep the tone clean, analytical, and natural. Do NOT use fake AI buzzwords.

4. SOURCE FACTUALITY:
   - Ground all factual claims strictly in the provided article content and source details. Do NOT invent unverified quotes.

5. SELECTION RATIONALE & QUALITY EVALUATION:
   - Provide a detailed rationale explaining:
     a) Why was this specific topic selected?
     b) Why is it relevant to your target domain?
     c) How did your editorial judge evaluate its quality compared to rejected topics?

Return strictly a JSON object matching this schema:
{
  "text": "Post body text written directly about the event/research findings in your persona's clean, authentic editorial voice (NO title references or meta-commentary)",
  "rationale": "Comprehensive selection rationale explaining domain relevance, timeliness, and quality judgment",
  "sourceClaims": ["List of core factual claims derived strictly from source"]
}
`;
}
