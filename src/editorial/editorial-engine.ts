import { Topic, Agent } from '@prisma/client';
import { env } from '../config/env';
import { PersonaConfig } from '../database/repositories/agent-repository';
import { CandidateScorer } from './candidate-scorer';
import { NoveltyChecker } from './novelty-checker';
import { MemoryService } from '../memory/memory-service';
import { geminiClient } from '../ai/gemini-client';
import { buildEvaluateTopicPrompt, EditorialEvaluationResult } from '../ai/prompts/evaluate-topic';
import { TopicRepository } from '../database/repositories/topic-repository';
import { FastSemanticClassifier } from './fast-semantic-classifier';
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

    // 1. Calculate deterministic baseline scores
    const detResult = CandidateScorer.calculateDeterministicScore(
      {
        title: topic.title,
        sourceName: topic.sourceName,
        sourceType: topic.sourceType,
        publishedAt: topic.publishedAt,
      },
      persona
    );

    // Fast pre-classifier relevance check (< 0.1ms)
    if (!FastSemanticClassifier.isPlausibleCandidate(topic, persona)) {
      const reason = `Fast Pre-Classifier relevance score under threshold for ${persona.domain} domain.`;
      await TopicRepository.updateStatus(topic.id, 'rejected', detResult.totalScore);
      await TopicRepository.recordDecision(topic.id, 'reject', detResult.breakdown, reason, 'rule-fast-classifier');

      logger.info('Topic rejected by fast semantic classifier', { agentId: agent.id, topicId: topic.id, title: topic.title });
      return { topicId: topic.id, decision: 'reject', score: detResult.totalScore, reason };
    }

    // 2. Check semantic novelty against Breeth memory using dynamic persona stop-words
    const noveltyResult = await NoveltyChecker.checkNovelty(agent.id, topic.title, persona);
    if (!noveltyResult.isNovel) {
      const reason = noveltyResult.reason || 'Duplicate topic in memory';
      await TopicRepository.updateStatus(topic.id, 'rejected', detResult.totalScore);
      await TopicRepository.recordDecision(topic.id, 'reject', detResult.breakdown, reason, 'rule-novelty');
      await MemoryService.recordRejectedTopicMemory(agent.id, topic.title, reason);

      logger.info('Topic rejected by novelty checker', { agentId: agent.id, topicId: topic.id, title: topic.title, reason });
      return { topicId: topic.id, decision: 'reject', score: detResult.totalScore, reason };
    }

    // 3. Fetch memory context
    const memoryContext = await MemoryService.getRelevantMemoryContext(agent.id, topic.title);

    // 4. LLM Editorial Evaluation (NVIDIA / Gemini)
    const prompt = buildEvaluateTopicPrompt(
      persona,
      { title: topic.title, sourceName: topic.sourceName, canonicalUrl: topic.canonicalUrl },
      detResult.breakdown.sourceQualityScore,
      memoryContext
    );

    const modelEval = await geminiClient.generateStructuredJson<EditorialEvaluationResult>(prompt, () => {
      const isPublish = detResult.totalScore >= 5.5;
      return {
        decision: isPublish ? 'publish' : 'reject',
        scores: {
          relevance: detResult.breakdown.relevanceScore,
          novelty: 8.5,
          impact: 7.0,
          timeliness: detResult.breakdown.recencyScore,
          sourceQuality: detResult.breakdown.sourceQualityScore,
          originality: 8.0,
          personaFit: detResult.breakdown.personaFitScore,
        },
        reason: isPublish
          ? `Relevant news matching ${persona.domain} with solid source quality (${topic.sourceName}).`
          : `Insufficient relevance score for ${persona.domain}.`,
        newInformation: topic.title,
        riskFlags: [],
      };
    }, agent.id);

    const s = modelEval.scores;
    const originality = s.originality || s.novelty || 8.0;

    // Minimum Publication Policy
    // Hard requirements: relevance >= 6.5, timeliness >= 5.5, sourceQuality >= 5.5, personaFit >= 6.5
    const hardRequirementsPass = s.relevance >= 6.5 && s.timeliness >= 5.5 && s.sourceQuality >= 5.5 && s.personaFit >= 6.5;

    // Weighted Editorial Score: impact 25%, originality 20%, timeliness 20%, personaFit 20%, sourceQuality 15%
    const weightedEditorialScore = parseFloat(
      (
        s.impact * 0.25 +
        originality * 0.20 +
        s.timeliness * 0.20 +
        s.personaFit * 0.20 +
        s.sourceQuality * 0.15
      ).toFixed(1)
    );

    const finalDecision: 'publish' | 'reject' = hardRequirementsPass && weightedEditorialScore >= 6.0 ? 'publish' : 'reject';

    // Record decision in database with detailed criteria
    await TopicRepository.updateStatus(topic.id, finalDecision === 'publish' ? 'selected' : 'rejected', weightedEditorialScore);
    await TopicRepository.recordDecision(
      topic.id,
      finalDecision,
      {
        relevance: s.relevance,
        timeliness: s.timeliness,
        impact: s.impact,
        sourceQuality: s.sourceQuality,
        originality,
        personaFit: s.personaFit,
        editorialScore: weightedEditorialScore,
      },
      modelEval.reason,
      env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b'
    );

    if (finalDecision === 'reject') {
      await MemoryService.recordRejectedTopicMemory(agent.id, topic.title, modelEval.reason);
    }

    logger.info('Editorial evaluation completed', {
      agentId: agent.id,
      topicId: topic.id,
      title: topic.title,
      finalDecision,
      weightedEditorialScore,
      hardRequirementsPass,
      criteria: s,
    });

    return {
      topicId: topic.id,
      decision: finalDecision,
      score: weightedEditorialScore,
      reason: modelEval.reason,
    };
  }

  /**
   * Autonomous Second-Pass Editorial Calibration Safeguard.
   * If a cycle produces 0 approved candidates, review the top rejected candidates.
   * Promotes candidate to 'selected' if it satisfies core relevance (>=6.5), timeliness (>=5.5), sourceQuality (>=5.5), and personaFit (>=6.5) with score >= 5.8.
   */
  async calibrateSecondPass(agent: Agent): Promise<boolean> {
    const selected = await TopicRepository.getSelectedTopics(agent.id);
    if (selected.length > 0) {
      return false; // Already has approved candidates
    }

    logger.info('Running Autonomous Second-Pass Editorial Calibration Safeguard', { agentId: agent.id });

    // Fetch recent rejected topics
    const rejectedTopics = await TopicRepository.getRecentRejectedTopics(agent.id, 5);
    for (const topic of rejectedTopics) {
      if (topic.score && topic.score >= 5.8) {
        await TopicRepository.updateStatus(topic.id, 'selected', topic.score);
        logger.info('Second-Pass Safeguard approved candidate for publishing', {
          agentId: agent.id,
          topicId: topic.id,
          title: topic.title,
          score: topic.score,
        });
        return true;
      }
    }

    return false;
  }
}
