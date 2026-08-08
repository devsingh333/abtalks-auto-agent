import { MemoryService } from '../memory/memory-service';
import { TopicRepository } from '../database/repositories/topic-repository';

export class NoveltyChecker {
  /**
   * Checks if a topic is novel relative to both PostgreSQL database history and Breeth agent memory.
   */
  static async checkNovelty(agentId: string, title: string): Promise<{ isNovel: boolean; reason?: string }> {
    // 1. Check PostgreSQL Database for previously published/selected topics with same title
    const isCoveredInDb = await TopicRepository.hasTopicBeenCovered(agentId, title);
    if (isCoveredInDb) {
      return {
        isNovel: false,
        reason: `Topic title "${title}" has already been selected or published in database history.`,
      };
    }

    // 2. Check Breeth Agent Memory for semantic duplicates
    const memoryContext = await MemoryService.getRelevantMemoryContext(agentId, title);
    const memoryLower = memoryContext.toLowerCase();
    const titleLower = title.toLowerCase();

    if (memoryLower.includes(titleLower)) {
      return {
        isNovel: false,
        reason: `Topic title "${title}" matches a previously recorded publication in Breeth agent memory.`,
      };
    }

    return { isNovel: true };
  }
}
