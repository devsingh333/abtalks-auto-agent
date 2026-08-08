import { describe, it, expect, beforeAll } from 'vitest';
import http from 'http';
import axios from 'axios';
import { app } from '../../src/app';
import { prisma } from '../../src/database/client';
import { autonomousWorker } from '../../src/agents/autonomous-worker';

describe('Autonomous Agent API End-to-End Test', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    return async () => {
      server.close();
      await prisma.$disconnect();
    };
  }, 15000);

  it('GET /health returns 200 OK', async () => {
    const res = await axios.get(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
  });

  it('POST /api/agent/init initializes agent, seeds memory, and starts worker', async () => {
    const initPayload = {
      persona: {
        name: 'Ada',
        domain: 'AI Security',
      },
    };

    const res = await axios.post(`${baseUrl}/api/agent/init`, initPayload);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('agentId');

    const agentId = res.data.agentId;
    expect(typeof agentId).toBe('string');

    // Test idempotency: calling init again with same payload returns same agentId
    const res2 = await axios.post(`${baseUrl}/api/agent/init`, initPayload);
    expect(res2.status).toBe(200);
    expect(res2.data.agentId).toBe(agentId);

    await autonomousWorker.stopWorkerForAgent(agentId);
  });

  it('GET /api/agent/feed returns feed posts and operates strictly as read-only', async () => {
    const initRes = await axios.post(`${baseUrl}/api/agent/init`, {
      persona: { name: 'E2E-Agent', domain: 'System Security' },
    });
    const agentId = initRes.data.agentId;

    // Execute one cycle
    await autonomousWorker.executeCycle(agentId);

    // Query feed endpoint
    const feedRes = await axios.get(`${baseUrl}/api/agent/feed`, {
      params: { agentId },
    });

    expect(feedRes.status).toBe(200);
    expect(feedRes.data).toHaveProperty('posts');
    expect(Array.isArray(feedRes.data.posts)).toBe(true);

    if (feedRes.data.posts.length > 0) {
      const post = feedRes.data.posts[0];
      expect(post).toHaveProperty('id');
      expect(post).toHaveProperty('createdAt');
      expect(post).toHaveProperty('text');
      expect(post).toHaveProperty('rationale');
      expect(post).toHaveProperty('sources');
      expect(Array.isArray(post.sources)).toBe(true);
    }

    // Verify GET /feed is read-only (calling feed multiple times does not trigger new post generation)
    const countBefore = feedRes.data.posts.length;
    const feedRes2 = await axios.get(`${baseUrl}/api/agent/feed`, {
      params: { agentId },
    });
    expect(feedRes2.data.posts.length).toBe(countBefore);

    await autonomousWorker.stopWorkerForAgent(agentId);
  }, 40000);
});
