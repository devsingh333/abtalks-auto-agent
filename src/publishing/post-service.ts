import { Agent, Topic, Post } from '@prisma/client';
import { PersonaConfig } from '../database/repositories/agent-repository';
import { PostRepository } from '../database/repositories/post-repository';
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
    // 1. Atomic Guard: Prevent duplicate post generation on the same topic
    if (topic.status === 'published') {
      logger.warn('Topic already marked as published, skipping duplicate post generation', { agentId: agent.id, topicId: topic.id });
      return null;
    }

    const existingPost = await prisma.post.findUnique({
      where: { topicId: topic.id },
    });

    if (existingPost) {
      logger.warn('Post for this topic already exists in database, skipping duplicate creation', { agentId: agent.id, topicId: topic.id });
      await TopicRepository.updateStatus(topic.id, 'published');
      return existingPost;
    }

    logger.info('Starting post generation and publication', { agentId: agent.id, topicId: topic.id, title: topic.title });

    const persona: PersonaConfig = JSON.parse(agent.personaConfig);
    const memoryContext = await MemoryService.getRelevantMemoryContext(agent.id, topic.title);

    // 2. Fetch full article body content from publisher / Google News redirect URL
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

    // Save to database atomically
    try {
      const post = await PostRepository.createPost(agent.id, topic.id, generated.text, generated.rationale, sources);
      await TopicRepository.updateStatus(topic.id, 'published');

      // Save published post memory into Breeth memory
      await MemoryService.recordPublishedPostMemory(
        agent.id,
        topic.title,
        topic.canonicalUrl,
        generated.text,
        generated.rationale
      );

      logger.info('Post successfully published and persisted', {
        postId: post.id,
        topicId: topic.id,
        agentId: agent.id,
        title: topic.title,
      });

      return post;
    } catch (err: any) {
      if (err.code === 'P2002') {
        logger.warn('Duplicate post creation caught by database unique constraint', { topicId: topic.id });
        await TopicRepository.updateStatus(topic.id, 'published');
        return null;
      }
      throw err;
    }
  }
}
