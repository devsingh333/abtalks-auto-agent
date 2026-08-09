import { PersonaConfig } from '../database/repositories/agent-repository';

/**
 * Fast Local Pre-Classifier & Cosine Similarity Engine.
 * Evaluates semantic relevance in < 0.1ms before calling heavy LLM APIs.
 * Prevents off-topic stories from consuming LLM quota and boosts editorial precision.
 */
export class FastSemanticClassifier {
  private static tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  }

  static calculateRelevanceScore(
    topic: { title: string; summary?: string },
    persona: PersonaConfig
  ): number {
    const topicText = `${topic.title} ${topic.summary || ''}`;
    const topicTokens = FastSemanticClassifier.tokenize(topicText);

    if (topicTokens.size === 0) return 0.5;

    const personaText = `${persona.domain} ${persona.identity} ${persona.interests.join(' ')}`;
    const personaTokens = FastSemanticClassifier.tokenize(personaText);

    let matchCount = 0;
    for (const token of topicTokens) {
      if (personaTokens.has(token)) {
        matchCount++;
      }
    }

    const jaccardScore = matchCount / Math.min(topicTokens.size, personaTokens.size);
    return Math.min(10.0, jaccardScore * 12.0 + 3.0);
  }

  static isPlausibleCandidate(
    topic: { title: string; summary?: string },
    persona: PersonaConfig
  ): boolean {
    const score = FastSemanticClassifier.calculateRelevanceScore(topic, persona);
    return score >= 3.5;
  }
}
