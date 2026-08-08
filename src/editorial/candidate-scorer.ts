import { PersonaConfig } from '../database/repositories/agent-repository';
import { getSourceQualityScore } from './source-quality';
import { getHoursSince } from '../utils/dates';

export interface DeterministicScoreResult {
  totalScore: number;
  breakdown: {
    recencyScore: number;
    sourceQualityScore: number;
    relevanceScore: number;
    personaFitScore: number;
  };
}

export class CandidateScorer {
  /**
   * Computes a deterministic editorial score (0-10) based on source quality, recency, and persona keyword match.
   */
  static calculateDeterministicScore(
    topic: { title: string; sourceName: string; sourceType: string; publishedAt?: Date | null },
    persona: PersonaConfig
  ): DeterministicScoreResult {
    // 1. Recency Score (10 for < 6h, decaying to 2 for > 48h)
    const hoursOld = topic.publishedAt ? getHoursSince(topic.publishedAt) : 12;
    let recencyScore = 10;
    if (hoursOld > 48) recencyScore = 2;
    else if (hoursOld > 24) recencyScore = 5;
    else if (hoursOld > 6) recencyScore = 8;

    // 2. Source Quality Score (1-10)
    const sourceQualityScore = getSourceQualityScore(topic.sourceName, topic.sourceType);

    // 3. Keyword Relevance Score
    const titleLower = topic.title.toLowerCase();
    let keywordHits = 0;

    // Check domain keywords
    const domainWords = persona.domain.toLowerCase().split(/[\s/,-]+/);
    domainWords.forEach((word) => {
      if (word.length > 2 && titleLower.includes(word)) {
        keywordHits += 1.5;
      }
    });

    // Check interest keywords
    persona.interests.forEach((interest) => {
      if (titleLower.includes(interest.toLowerCase())) keywordHits += 2;
    });

    let personaAvoidHits = 0;
    persona.avoid.forEach((avoidTerm) => {
      if (titleLower.includes(avoidTerm.toLowerCase())) personaAvoidHits += 2;
    });

    let relevanceScore: number;
    let personaFitScore: number;

    if (keywordHits === 0) {
      relevanceScore = Math.max(1, 2.5 - personaAvoidHits * 3);
      personaFitScore = Math.max(1, 2.0 - personaAvoidHits * 3);
    } else {
      relevanceScore = Math.min(10, Math.max(1, 4 + keywordHits * 2 - personaAvoidHits * 4));
      personaFitScore = Math.min(10, Math.max(1, 4 + keywordHits * 2.5 - personaAvoidHits * 4));
    }

    // Weighted Formula:
    // score = recency * 0.20 + sourceQuality * 0.25 + relevance * 0.30 + personaFit * 0.25
    const totalScore =
      recencyScore * 0.2 +
      sourceQualityScore * 0.25 +
      relevanceScore * 0.3 +
      personaFitScore * 0.25;

    return {
      totalScore: Math.round(totalScore * 10) / 10,
      breakdown: {
        recencyScore,
        sourceQualityScore,
        relevanceScore,
        personaFitScore,
      },
    };
  }
}
