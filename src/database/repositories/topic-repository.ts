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

  static async hasTopicBeenCovered(agentId: string, title: string): Promise<boolean> {
    const existing = await prisma.topic.findFirst({
      where: {
        agentId,
        title: {
          equals: title,
        },
        status: {
          in: ['published', 'selected'],
        },
      },
    });
    return existing !== null;
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

  static async recordDecision(topicId: string, decision: 'publish' | 'reject', scores: Record<string, number>, reason: string, model: string): Promise<EditorialDecision> {
    return prisma.editorialDecision.create({
      data: {
        topicId,
        decision,
        scores: JSON.stringify(scores),
        reason,
        model,
      },
    });
  }
}
