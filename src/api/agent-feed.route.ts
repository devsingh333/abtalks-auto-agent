import { Request, Response } from 'express';
import { env } from '../config/env';
import { AgentManager } from '../agents/agent-manager';
import { logger } from '../utils/logger';

export async function handleGetAgentFeed(req: Request, res: Response) {
  try {
    const agentId = req.query.agentId as string;

    if (env.NODE_ENV !== 'production') {
      logger.debug('[ENDPOINT] Processing GET /api/agent/feed request', { agentId });
    }

    if (!agentId || agentId.trim().length === 0) {
      if (env.NODE_ENV !== 'production') {
        logger.debug('[ENDPOINT] GET /api/agent/feed rejected: missing agentId query parameter');
      }
      return res.status(400).json({ error: 'agentId query parameter is required' });
    }

    const feed = await AgentManager.getAgentFeed(agentId);

    if (env.NODE_ENV !== 'production') {
      logger.debug('[ENDPOINT] GET /api/agent/feed completed successfully', { agentId, postCount: feed.posts.length });
    }

    return res.status(200).json(feed);
  } catch (err) {
    logger.error('Error handling /api/agent/feed endpoint', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
