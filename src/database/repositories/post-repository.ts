import { prisma } from '../client';
import { Post, Prisma } from '@prisma/client';

export type PostWithSources = Prisma.PostGetPayload<{
  include: { sources: true };
}>;

export class PostRepository {
  static async createPost(
    agentId: string,
    topicId: string,
    text: string,
    rationale: string,
    sources: string[]
  ): Promise<PostWithSources> {
    return prisma.post.create({
      data: {
        agentId,
        topicId,
        text,
        rationale,
        sources: {
          create: sources.map((url) => ({ url })),
        },
      },
      include: {
        sources: true,
      },
    });
  }

  static async getPostsByAgent(agentId: string, limit = 50): Promise<PostWithSources[]> {
    return prisma.post.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sources: true,
      },
    });
  }

  static async getLastPost(agentId: string): Promise<Post | null> {
    return prisma.post.findFirst({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getPostsInTimeframe(agentId: string, since: Date): Promise<Post[]> {
    return prisma.post.findMany({
      where: {
        agentId,
        createdAt: { gte: since },
      },
    });
  }
}
