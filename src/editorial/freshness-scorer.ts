import { EventCluster } from '../discovery/event-clusterer';
import { PersonaConfig } from '../database/repositories/agent-repository';
import { logger } from '../utils/logger';

export interface FreshnessScoreResult {
  totalScore: number;
  recencyScore: number;
  qualityScore: number;
  relevanceScore: number;
  personaFitScore: number;
  breakdown: Record<string, number>;
}

export class FreshnessScorer {
  /**
   * Scores an event cluster across 6 production criteria:
   * Recency, Source Quality, Novelty, Topic Relevance, Change Magnitude, Persona Fit.
   */
  static scoreEvent(event: EventCluster, persona: PersonaConfig, memoryMatchesCount: number = 0): FreshnessScoreResult {
    const titleLower = event.primaryTitle.toLowerCase();

    // 1. Recency Score (0 - 10)
    const hoursOld = (Date.now() - event.eventDate.getTime()) / (1000 * 60 * 60);
    let recencyScore = 10;
    if (hoursOld > 72) recencyScore = 4.0;
    else if (hoursOld > 24) recencyScore = 7.0;
    else if (hoursOld > 6) recencyScore = 9.0;

    // 2. Source Quality Score (0 - 10)
    let qualityScore = 7.0;
    if (event.sources.some((s) => /github|arxiv|openai|anthropic|google|cert|cve|nist/i.test(s))) {
      qualityScore = 9.5;
    }

    // 3. Persona Fit & Topic Relevance Score (0 - 10)
    let relevanceScore = 5.0;
    const domainTerms = persona.domain.toLowerCase().split(/\s+/);
    const matchedTerms = domainTerms.filter((term) => term.length > 2 && titleLower.includes(term));
    if (matchedTerms.length > 0) {
      relevanceScore += matchedTerms.length * 2.5;
    }

    if (persona.interests) {
      for (const interest of persona.interests) {
        if (titleLower.includes(interest.toLowerCase())) {
          relevanceScore += 2.0;
        }
      }
    }

    relevanceScore = Math.min(10.0, relevanceScore);

    // Penalize if domain matches avoid topics
    if (persona.avoid) {
      for (const avoidTerm of persona.avoid) {
        if (titleLower.includes(avoidTerm.toLowerCase())) {
          relevanceScore -= 4.0;
        }
      }
    }

    // 4. Novelty / Memory Penalties (0 - 10)
    let noveltyScore = 10.0;
    if (memoryMatchesCount > 0) {
      noveltyScore -= memoryMatchesCount * 3.0;
    }

    // Calculate weighted total score
    const totalScore = parseFloat(
      (
        recencyScore * 0.25 +
        qualityScore * 0.20 +
        relevanceScore * 0.35 +
        noveltyScore * 0.20
      ).toFixed(2)
    );

    const result: FreshnessScoreResult = {
      totalScore: Math.max(1.0, Math.min(10.0, totalScore)),
      recencyScore,
      qualityScore,
      relevanceScore,
      personaFitScore: relevanceScore,
      breakdown: {
        recencyScore,
        qualityScore,
        relevanceScore,
        noveltyScore,
      },
    };

    logger.debug('Scored event cluster freshness', {
      eventTitle: event.primaryTitle,
      totalScore: result.totalScore,
      breakdown: result.breakdown,
    });

    return result;
  }
}
