import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface MemoryRecord {
  id: string;
  agentId: string;
  category: 'persona' | 'topic_published' | 'topic_rejected' | 'perspective';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export class BreethClient {
  private client: AxiosInstance | null = null;
  private inMemoryStore: Map<string, MemoryRecord[]> = new Map();

  constructor() {
    if (env.BREETH_API_KEY && env.BREETH_API_KEY !== 'mock_key' && env.BREETH_API_KEY !== 'your_breeth_api_key_here') {
      this.client = axios.create({
        baseURL: env.BREETH_BASE_URL,
        headers: {
          Authorization: `Bearer ${env.BREETH_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      });
    }
  }

  async storeMemory(agentId: string, record: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<MemoryRecord> {
    const mem: MemoryRecord = {
      ...record,
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    // Store in-memory fallback cache
    const existing = this.inMemoryStore.get(agentId) || [];
    existing.push(mem);
    this.inMemoryStore.set(agentId, existing);

    if (this.client) {
      try {
        // Official Breeth API endpoint: POST /v1/episodes
        await this.client.post('/v1/episodes', {
          content: mem.content,
          group_id: agentId,
          source_description: 'api',
        });
        logger.info('Memory successfully stored to official Breeth API', { agentId, category: mem.category });
      } catch (err) {
        const message = (err as Error)?.message || String(err);
        logger.warn('Breeth REST API store call failed; memory saved in local fallback cache', { agentId, message });
      }
    } else {
      logger.info('Breeth API key unconfigured; stored in local semantic memory store', { agentId, category: mem.category });
    }

    return mem;
  }

  async recallMemories(agentId: string, query: string, limit = 5): Promise<MemoryRecord[]> {
    if (this.client) {
      try {
        // Official Breeth API endpoint: POST /v1/search
        const response = await this.client.post('/v1/search', {
          query,
          group_id: agentId,
        });

        if (response.data) {
          const memories: MemoryRecord[] = [];
          
          // Handle response format from Breeth knowledge graph / vector search
          if (Array.isArray(response.data.edges) && response.data.edges.length > 0) {
            for (const edge of (response.data.edges || []).slice(0, limit)) {
              memories.push({
                id: `edge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                agentId,
                category: 'perspective',
                content: edge.fact_text || `${edge.source_name} ${edge.relation || 'related to'} ${edge.target_name}`,
                createdAt: new Date().toISOString(),
              });
            }
            return memories;
          } else if (Array.isArray(response.data.memories) && response.data.memories.length > 0) {
            return response.data.memories;
          }
        }
      } catch (err) {
        const message = (err as Error)?.message || String(err);
        logger.warn('Breeth search query failed, using local semantic fallback store', { agentId, query, message });
      }
    }

    // Local semantic query fallback
    const all = this.inMemoryStore.get(agentId) || [];
    const queryLower = query.toLowerCase();
    const matches = all.filter(
      (m) => m.content.toLowerCase().includes(queryLower) || (m.metadata?.title && String(m.metadata.title).toLowerCase().includes(queryLower))
    );

    // If query filter returns empty, return most recent memories
    return ((matches.length > 0 ? matches : all) || []).slice(-limit);
  }

  async purgeAgentMemory(agentId: string): Promise<void> {
    // 1. Clear local in-memory fallback cache
    this.inMemoryStore.delete(agentId);

    // 2. Call official Breeth REST API to purge agent group memory
    if (this.client) {
      try {
        await this.client.delete(`/v1/episodes?group_id=${agentId}`);
        logger.info('Purged official Breeth vector memory for agent', { agentId });
      } catch (err) {
        const message = (err as Error)?.message || String(err);
        logger.warn('Breeth REST API memory purge notice', { agentId, message });
      }
    }
  }
}

export const breethClient = new BreethClient();
