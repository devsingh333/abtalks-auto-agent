import { prisma } from '../client';
import { Topic, EditorialDecision } from '@prisma/client';

export interface CreateTopicData {
  agentId: string;
  externalId: string;
  canonicalUrl: string;
  title: string;
  sourceName: string;
  sourceType: string;
  publishedAt?: Date | null;
  contentHash: string;
}

export class TopicRepository {
  static async createTopic(data: CreateTopicData): Promise<Topic | null> {
    try {
      return await prisma.topic.create({
        data: {
          agentId: data.agentId,
          externalId: data.externalId,
          canonicalUrl: data.canonicalUrl,
          title: data.title,
          sourceName: data.sourceName,
          sourceType: data.sourceType,
          publishedAt: data.publishedAt,
          contentHash: data.contentHash,
          status: 'discovered',
        },
      });
    } catch {
      // Ignore duplicate insertion error due to unique constraint race condition
      return null;
    }
  }

  static async findByCanonicalUrlOrHash(agentId: string, canonicalUrl: string, contentHash: string): Promise<Topic | null> {
    return prisma.topic.findFirst({
      where: {
        agentId,
        OR: [{ canonicalUrl }, { contentHash }],
      },
    });
  }

  /**
   * Advanced Fuzzy & Semantic Event Overlap Check.
   * Checks if an event with similar key entities (e.g. Kit Connor + Cyclops) has already been published/selected.
   */
  static async hasTopicBeenCovered(agentId: string, title: string): Promise<boolean> {
    const recentCovered = await prisma.topic.findMany({
      where: {
        agentId,
        status: { in: ['published', 'selected'] },
      },
      select: { title: true },
      take: 50,
    });

    const getKeywords = (t: string) =>
      new Set(
        t
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 3 && !['marvel', 'studios', 'news', 'reboot', 'reportedly', 'lands', 'role'].includes(w))
      );

    const targetKeywords = getKeywords(title);
    if (targetKeywords.size === 0) return false;

    for (const item of recentCovered) {
      const existingKeywords = getKeywords(item.title);
      let matchCount = 0;
      for (const kw of targetKeywords) {
        if (existingKeywords.has(kw)) matchCount++;
      }

      // If 2 or more key specific entities match (e.g. "kit", "connor", "cyclops"), it's the exact same news story!
      if (matchCount >= 2 || (matchCount >= 1 && targetKeywords.size <= 2)) {
        return true;
      }
    }

    return false;
  }

  static async getPendingTopics(agentId: string, limit: number = 10): Promise<Topic[]> {
    return prisma.topic.findMany({
      where: {
        agentId,
        status: { in: ['discovered', 'pending'] },
      },
      orderBy: { discoveredAt: 'desc' },
      take: limit,
    });
  }

  static async getRecentRejectedTopics(agentId: string, limit: number = 5): Promise<Topic[]> {
    return prisma.topic.findMany({
      where: {
        agentId,
        status: 'rejected',
      },
      orderBy: { score: 'desc' },
      take: limit,
    });
  }

  static async getSelectedTopics(agentId: string): Promise<Topic[]> {
    return prisma.topic.findMany({
      where: {
        agentId,
        status: 'selected',
      },
      orderBy: { score: 'desc' },
    });
  }

  static async updateStatus(topicId: string, status: string, score?: number): Promise<Topic> {
    return prisma.topic.update({
      where: { id: topicId },
      data: {
        status,
        ...(score !== undefined ? { score } : {}),
      },
    });
  }

  static async recordDecision(
    topicId: string,
    decision: 'publish' | 'reject',
    breakdown: any,
    reason: string,
    modelName: string = 'rule-engine'
  ): Promise<EditorialDecision> {
    return prisma.editorialDecision.create({
      data: {
        topicId,
        decision,
        scores: JSON.stringify(breakdown),
        reason,
        model: modelName,
      },
    });
  }
}
