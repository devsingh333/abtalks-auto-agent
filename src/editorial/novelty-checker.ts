import { LlmEventComparator } from './llm-event-comparator';
import { TopicRepository } from '../database/repositories/topic-repository';
import { PersonaConfig } from '../database/repositories/agent-repository';

export class NoveltyChecker {
  /**
   * Checks if a topic is novel relative to database history and Breeth agent memory.
   * Uses Hybrid LLM Event Comparator to natively distinguish identical events from novel sub-topics.
   */
  static async checkNovelty(
    agentId: string,
    title: string,
    persona?: PersonaConfig
  ): Promise<{ isNovel: boolean; reason?: string }> {
    // 1. Check PostgreSQL Database for exact title duplicate
    const exactDbDuplicate = await TopicRepository.hasExactTitleBeenCovered(agentId, title);
    if (exactDbDuplicate) {
      return {
        isNovel: false,
        reason: `Exact topic title "${title}" has already been published or selected in database history.`,
      };
    }

    // 2. Execute Hybrid LLM Semantic Event Comparator
    const comparison = await LlmEventComparator.checkEventUniqueness(agentId, title);
    if (comparison.sameEvent) {
      return {
        isNovel: false,
        reason: comparison.reason || `LLM Event Comparator identified topic as a duplicate of a recent publication.`,
      };
    }

    return { isNovel: true };
  }
}
