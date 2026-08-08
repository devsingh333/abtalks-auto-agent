import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { AgentManager } from '../agents/agent-manager';
import { logger } from '../utils/logger';

const initSchema = z.object({
  persona: z.object({
    name: z.string().min(1, 'Persona name is required'),
    domain: z.string().min(1, 'Persona domain is required'),
    identity: z.string().optional(),
    interests: z.array(z.string()).optional(),
    avoid: z.array(z.string()).optional(),
    editorialPrinciples: z.array(z.string()).optional(),
    voice: z
      .object({
        tone: z.string().optional(),
        length: z.string().optional(),
        style: z.string().optional(),
      })
      .optional(),
  }),
});

export async function handleInitAgent(req: Request, res: Response) {
  try {
    if (env.NODE_ENV !== 'production') {
      logger.debug('[ENDPOINT] Processing POST /api/agent/init request', { body: req.body });
    }

    const parseResult = initSchema.safeParse(req.body);
    if (!parseResult.success) {
      if (env.NODE_ENV !== 'production') {
        logger.debug('[ENDPOINT] POST /api/agent/init validation failed', { errors: parseResult.error.issues });
      }
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    const result = await AgentManager.initializeAgent(parseResult.data);

    if (env.NODE_ENV !== 'production') {
      logger.debug('[ENDPOINT] POST /api/agent/init completed successfully', { agentId: result.agentId });
    }

    return res.status(200).json(result);
  } catch (err) {
    logger.error('Error handling /api/agent/init endpoint', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
