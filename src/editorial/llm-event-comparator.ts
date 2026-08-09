import { geminiClient } from '../ai/gemini-client';
import { logger } from '../utils/logger';
import { prisma } from '../database/client';

export interface EventComparisonResult {
  sameEvent: boolean;
  reason: string;
}

export class LlmEventComparator {
  /**
   * Compares a candidate topic title against the agent's recent published/selected post titles
   * using a micro-LLM prompt. Natively understands whether two articles cover the exact same
   * specific news event versus distinct sub-topics within the same franchise/domain.
   */
  static async checkEventUniqueness(
    agentId: string,
    candidateTitle: string
  ): Promise<EventComparisonResult> {
    // Fetch last 5 published posts for this agent
    const recentPosts = await prisma.post.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        topic: {
          select: { title: true },
        },
      },
    });

    const recentTitles = recentPosts.map((p) => p.topic?.title).filter((t): t is string => Boolean(t));

    // If agent has no recent published posts, the candidate is 100% novel!
    if (recentTitles.length === 0) {
      return { sameEvent: false, reason: 'First post for agent.' };
    }

    const prompt = `You are an Autonomous News Deduplication & Event Classifier.
Your task is to determine whether a CANDIDATE STORY covers the EXACT SAME SPECIFIC NEWS EVENT as any of the RECENT PUBLISHED POSTS, or if it is a DISTINCT, NOVEL sub-topic/development.

CANDIDATE STORY:
"${candidateTitle}"

RECENT PUBLISHED POSTS:
${recentTitles.map((t, idx) => `${idx + 1}. "${t}"`).join('\n')}

INSTRUCTIONS:
1. If CANDIDATE STORY covers the exact same real-world event/announcement as any published post (even if using different phrasing like "VOD Release Date" vs "Digital Streaming Window"), return sameEvent: true.
2. If CANDIDATE STORY is a distinct sub-topic, casting news, vulnerability disclosure, or separate development about the same general franchise/domain, return sameEvent: false.

Return JSON in this format ONLY:
{
  "sameEvent": boolean,
  "reason": "Short 1-sentence explanation"
}`;

    try {
      const result = await geminiClient.generateStructuredJson<EventComparisonResult>(
        prompt,
        () => ({
          sameEvent: false,
          reason: 'Default fallback: treating as distinct event.',
        }),
        agentId
      );

      logger.info('LLM Event Comparator evaluation completed', {
        agentId,
        candidateTitle,
        sameEvent: result.sameEvent,
        reason: result.reason,
      });

      return result;
    } catch (err) {
      logger.warn('LLM Event Comparator failed, falling back to novel', { agentId, candidateTitle, err });
      return { sameEvent: false, reason: 'LLM comparator fallback.' };
    }
  }
}
