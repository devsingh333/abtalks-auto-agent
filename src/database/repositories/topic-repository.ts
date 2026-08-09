import { prisma } from '../client';
import { Topic, EditorialDecision } from '@prisma/client';
import { PersonaConfig } from './agent-repository';

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
          publishedAt: data.publishedAt || new Date(),
          contentHash: data.contentHash,
          status: 'discovered',
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        return null;
      }
      throw err;
    }
  }

  static async findExisting(agentId: string, canonicalUrl: string, contentHash: string): Promise<Topic | null> {
    return prisma.topic.findFirst({
      where: {
        agentId,
        OR: [{ canonicalUrl }, { contentHash }],
      },
    });
  }

  static async findByCanonicalUrlOrHash(agentId: string, canonicalUrl: string, contentHash: string): Promise<Topic | null> {
    return this.findExisting(agentId, canonicalUrl, contentHash);
  }

  /**
   * Checks if the exact topic title has already been published/selected for this agent.
   */
  static async hasExactTitleBeenCovered(agentId: string, title: string): Promise<boolean> {
    const existing = await prisma.topic.findFirst({
      where: {
        agentId,
        status: { in: ['published', 'selected', 'generating'] },
        title: { equals: title },
      },
      select: { id: true },
    });
    return Boolean(existing);
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
