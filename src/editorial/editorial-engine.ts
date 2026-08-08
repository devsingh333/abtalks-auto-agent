import { Topic, Agent } from '@prisma/client';
import { env } from '../config/env';
import { PersonaConfig } from '../database/repositories/agent-repository';
import { CandidateScorer } from './candidate-scorer';
import { NoveltyChecker } from './novelty-checker';
import { MemoryService } from '../memory/memory-service';
import { geminiClient } from '../ai/gemini-client';
import { buildEvaluateTopicPrompt, EditorialEvaluationResult } from '../ai/prompts/evaluate-topic';
import { TopicRepository } from '../database/repositories/topic-repository';
import { logger } from '../utils/logger';

export interface FinalEditorialDecision {
  topicId: string;
  decision: 'publish' | 'reject';
  score: number;
  reason: string;
}

export class EditorialEngine {
  async evaluateTopic(agent: Agent, topic: Topic): Promise<FinalEditorialDecision> {
    const persona: PersonaConfig = JSON.parse(agent.personaConfig);

    // 1. Calculate deterministic scores
    const detResult = CandidateScorer.calculateDeterministicScore(
      {
        title: topic.title,
        sourceName: topic.sourceName,
        sourceType: topic.sourceType,
        publishedAt: topic.publishedAt,
      },
      persona
    );

    // 2. Fast-path rejection for low deterministic relevance/score
    if (detResult.totalScore < 4.5) {
      const reason = `Insufficient relevance score (${detResult.totalScore}/10) for ${persona.domain} persona priorities.`;
      await TopicRepository.updateStatus(topic.id, 'rejected', detResult.totalScore);
      await TopicRepository.recordDecision(topic.id, 'reject', detResult.breakdown, reason, 'rule-deterministic-filter');

      logger.info('Topic rejected by deterministic scorer', { agentId: agent.id, topicId: topic.id, title: topic.title, score: detResult.totalScore });
      return { topicId: topic.id, decision: 'reject', score: detResult.totalScore, reason };
    }

    // 3. Check semantic novelty against Breeth memory
    const noveltyResult = await NoveltyChecker.checkNovelty(agent.id, topic.title);
    if (!noveltyResult.isNovel) {
      const reason = noveltyResult.reason || 'Duplicate topic in memory';
      await TopicRepository.updateStatus(topic.id, 'rejected', detResult.totalScore);
      await TopicRepository.recordDecision(topic.id, 'reject', detResult.breakdown, reason, 'rule-novelty');
      await MemoryService.recordRejectedTopicMemory(agent.id, topic.title, reason);

      logger.info('Topic rejected by novelty checker', { agentId: agent.id, topicId: topic.id, title: topic.title, reason });
      return { topicId: topic.id, decision: 'reject', score: detResult.totalScore, reason };
    }

    // 4. Fetch memory context
    const memoryContext = await MemoryService.getRelevantMemoryContext(agent.id, topic.title);

    // 5. Invoke Gemini for semantic evaluation with fallback
    const prompt = buildEvaluateTopicPrompt(
      persona,
      { title: topic.title, sourceName: topic.sourceName, canonicalUrl: topic.canonicalUrl },
      detResult.breakdown.sourceQualityScore,
      memoryContext
    );

    const modelEval = await geminiClient.generateStructuredJson<EditorialEvaluationResult>(prompt, () => {
      // Fallback model evaluation based on deterministic score threshold
      const isPublish = detResult.totalScore >= 6.0;
      return {
        decision: isPublish ? 'publish' : 'reject',
        scores: {
          relevance: detResult.breakdown.relevanceScore,
          novelty: 8,
          impact: 7,
          timeliness: detResult.breakdown.recencyScore,
          sourceQuality: detResult.breakdown.sourceQualityScore,
          personaFit: detResult.breakdown.personaFitScore,
        },
        reason: isPublish
          ? `Primary technical disclosure matching ${persona.domain} persona priorities with strong source quality (${topic.sourceName}).`
          : `Insufficient relevance score (${detResult.totalScore}/10) for ${persona.domain} persona criteria.`,
        newInformation: topic.title,
        riskFlags: [],
      };
    }, agent.id);

    // Combined score calculation
    const modelAvgScore =
      (modelEval.scores.relevance +
        modelEval.scores.novelty +
        modelEval.scores.impact +
        modelEval.scores.timeliness +
        modelEval.scores.sourceQuality +
        modelEval.scores.personaFit) /
      6;

    const finalScore = Math.round((detResult.totalScore * 0.4 + modelAvgScore * 0.6) * 10) / 10;
    const finalDecision: 'publish' | 'reject' = modelEval.decision === 'publish' && finalScore >= 6.0 ? 'publish' : 'reject';

    // Record decision in database
    await TopicRepository.updateStatus(topic.id, finalDecision === 'publish' ? 'selected' : 'rejected', finalScore);
    await TopicRepository.recordDecision(topic.id, finalDecision, { ...detResult.breakdown, ...modelEval.scores }, modelEval.reason, env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b');

    if (finalDecision === 'reject') {
      await MemoryService.recordRejectedTopicMemory(agent.id, topic.title, modelEval.reason);
    }

    logger.info('Editorial evaluation finished', {
      agentId: agent.id,
      topicId: topic.id,
      title: topic.title,
      finalDecision,
      finalScore,
    });

    return {
      topicId: topic.id,
      decision: finalDecision,
      score: finalScore,
      reason: modelEval.reason,
    };
  }
}
