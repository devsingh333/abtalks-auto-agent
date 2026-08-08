import { describe, it, expect } from 'vitest';
import { CandidateScorer } from '../../src/editorial/candidate-scorer';
import { PersonaConfig } from '../../src/database/repositories/agent-repository';

describe('CandidateScorer', () => {
  const samplePersona: PersonaConfig = {
    name: 'Ada',
    domain: 'AI Security',
    identity: 'AI Security Researcher',
    interests: ['prompt injection', 'agent security', 'vulnerability'],
    avoid: ['generic hype', 'crypto'],
    editorialPrinciples: ['Primary sources'],
    voice: { tone: 'analytical', length: 'concise', style: 'evidence-driven' },
  };

  it('calculates higher deterministic score for high quality primary sources matching persona interests', () => {
    const topic = {
      title: 'New Prompt Injection Vulnerability Disclosed in Autonomous Agents',
      sourceName: 'OpenAI Research',
      sourceType: 'official_blog',
      publishedAt: new Date(),
    };

    const scoreResult = CandidateScorer.calculateDeterministicScore(topic, samplePersona);
    expect(scoreResult.totalScore).toBeGreaterThanOrEqual(8.0);
    expect(scoreResult.breakdown.sourceQualityScore).toBe(10);
  });

  it('penalizes topics matching persona avoid keywords', () => {
    const topic = {
      title: 'Generic Hype Announcement for AI Crypto Token',
      sourceName: 'Secondary News',
      sourceType: 'tech_news',
      publishedAt: new Date(),
    };

    const scoreResult = CandidateScorer.calculateDeterministicScore(topic, samplePersona);
    expect(scoreResult.totalScore).toBeLessThan(5.0);
  });
});
