import { breethClient } from './breeth-client';
import { PersonaConfig } from '../database/repositories/agent-repository';

export class MemoryService {
  static async seedPersonaMemory(agentId: string, persona: PersonaConfig): Promise<void> {
    await breethClient.storeMemory(agentId, {
      agentId,
      category: 'persona',
      content: `Persona Initialized: ${persona.name} (${persona.domain}). Identity: ${persona.identity}. Stance: ${persona.editorialPrinciples.join('; ')}.`,
      metadata: { persona },
    });
  }

  static async recordPublishedPostMemory(
    agentId: string,
    topicTitle: string,
    canonicalUrl: string,
    perspective: string,
    rationale: string
  ): Promise<void> {
    await breethClient.storeMemory(agentId, {
      agentId,
      category: 'topic_published',
      content: `Published Topic: "${topicTitle}". URL: ${canonicalUrl}. Key Perspective: ${perspective}. Rationale: ${rationale}`,
      metadata: { topicTitle, canonicalUrl, perspective, rationale },
    });
  }

  static async recordRejectedTopicMemory(agentId: string, topicTitle: string, reason: string): Promise<void> {
    await breethClient.storeMemory(agentId, {
      agentId,
      category: 'topic_rejected',
      content: `Rejected Topic: "${topicTitle}". Reason: ${reason}`,
      metadata: { topicTitle, reason },
    });
  }

  static async getRelevantMemoryContext(agentId: string, query: string): Promise<string> {
    const memories = await breethClient.recallMemories(agentId, query, 5);
    if (memories.length === 0) return 'No relevant past memory records.';

    return memories
      .map((m) => `-[${m.category.toUpperCase()}] ${m.createdAt}: ${m.content}`)
      .join('\n');
  }

  static async purgeAgentMemory(agentId: string): Promise<void> {
    await breethClient.purgeAgentMemory(agentId);
  }
}
