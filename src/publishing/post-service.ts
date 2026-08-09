import { Agent, Topic, Post } from '@prisma/client';
import { PersonaConfig } from '../database/repositories/agent-repository';
import { TopicRepository } from '../database/repositories/topic-repository';
import { MemoryService } from '../memory/memory-service';
import { geminiClient } from '../ai/gemini-client';
import { buildGeneratePostPrompt, GeneratedPostResult } from '../ai/prompts/generate-post';
import { PostValidator } from './post-validator';
import { logger } from '../utils/logger';
import { prisma } from '../database/client';
import { ArticleScraperService } from '../discovery/article-scraper';

export class PostService {
  async generateAndPublishPost(agent: Agent, topic: Topic, editorialReason: string): Promise<Post | null> {
    // 1. Atomic Database Claim Lock: Claim topic atomically BEFORE calling expensive LLM generation
    const claimed = await prisma.topic.updateMany({
      where: {
        id: topic.id,
        status: { in: ['selected', 'evaluated', 'discovered'] },
      },
      data: {
        status: 'generating',
      },
    });

    if (claimed.count === 0) {
      logger.warn('Topic already claimed, generating, or published by another worker cycle; skipping duplicate generation', {
        agentId: agent.id,
        topicId: topic.id,
      });

      // Check if post already exists
      const existingPost = await prisma.post.findUnique({
        where: { topicId: topic.id },
      });
      return existingPost || null;
    }

    logger.info('Claimed topic lock; starting post generation and publication', {
      agentId: agent.id,
      topicId: topic.id,
      title: topic.title,
    });

    const persona: PersonaConfig = JSON.parse(agent.personaConfig);
    const memoryContext = await MemoryService.getRelevantMemoryContext(agent.id, topic.title);

    // Fetch full article body content from publisher / Google News redirect URL
    const articleContent = await ArticleScraperService.fetchArticleContent(topic.canonicalUrl);

    const prompt = buildGeneratePostPrompt(
      persona,
      { title: topic.title, canonicalUrl: topic.canonicalUrl, sourceName: topic.sourceName },
      editorialReason,
      memoryContext,
      articleContent
    );

    const generated = await geminiClient.generateStructuredJson<GeneratedPostResult>(
      prompt,
      () => {
        return {
          text: `${topic.title}. Verified findings from ${topic.sourceName} highlight key developments in ${persona.domain}. Full details: ${topic.canonicalUrl}`,
          rationale: `Selected because ${topic.title} represents a primary technical development in ${persona.domain} from ${topic.sourceName}. Chosen over generic announcements due to primary technical evidence.`,
          sourceClaims: [topic.title],
        };
      },
      agent.id
    );

    const sources = [topic.canonicalUrl];
    const validation = PostValidator.validate(generated.text, generated.rationale, sources);

    if (!validation.isValid) {
      logger.error('Post generation failed validation', { agentId: agent.id, topicId: topic.id, errors: validation.errors });
      await TopicRepository.updateStatus(topic.id, 'failed');
      return null;
    }

    // 2. Save post and update topic status to 'published' in a SINGLE atomic database transaction
    let post: Post;
    try {
      post = await prisma.$transaction(async (tx) => {
        const createdPost = await tx.post.create({
          data: {
            agentId: agent.id,
            topicId: topic.id,
            text: generated.text,
            rationale: generated.rationale,
            sources: {
              create: sources.map((url) => ({ url })),
            },
          },
          include: {
            sources: true,
            topic: true,
            agent: true,
          },
        });

        await tx.topic.update({
          where: { id: topic.id },
          data: { status: 'published' },
        });

        return createdPost;
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        logger.warn('Duplicate post creation caught by database unique constraint', { topicId: topic.id });
        await TopicRepository.updateStatus(topic.id, 'published');
        const existing = await prisma.post.findUnique({ where: { topicId: topic.id } });
        return existing || null;
      }
      await TopicRepository.updateStatus(topic.id, 'failed');
      throw err;
    }

    // 3. Non-blocking side effect: Save published post memory into Breeth memory
    try {
      await MemoryService.recordPublishedPostMemory(
        agent.id,
        topic.title,
        topic.canonicalUrl,
        generated.text,
        generated.rationale
      );
    } catch (memErr) {
      logger.warn('Breeth memory recording failed as side-effect; post remains successfully published in database', {
        agentId: agent.id,
        topicId: topic.id,
        error: memErr,
      });
    }

    logger.info('Post successfully published and persisted atomically', {
      postId: post.id,
      topicId: topic.id,
      agentId: agent.id,
      title: topic.title,
    });

    return post;
  }
}
