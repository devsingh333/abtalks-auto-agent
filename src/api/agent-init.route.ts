import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { AgentManager } from '../agents/agent-manager';
import { ORIGINAL_AI_PERSONAS } from '../agents/persona-presets';
import { logger } from '../utils/logger';

const initSchema = z.object({
  presetKey: z.string().optional(),
  persona: z
    .object({
      name: z.string().min(1, 'Persona name is required'),
      role: z.string().optional(),
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
          stance: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function handleInitAgent(req: Request, res: Response) {
  try {
    if (env.NODE_ENV !== 'production') {
      logger.debug('[ENDPOINT] Processing POST /api/agent/init request', { body: req.body });
    }

    const parseResult = initSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    let personaConfig = parseResult.data.persona;

    if (parseResult.data.presetKey && ORIGINAL_AI_PERSONAS[parseResult.data.presetKey]) {
      personaConfig = ORIGINAL_AI_PERSONAS[parseResult.data.presetKey];
    }

    if (!personaConfig || !personaConfig.name || !personaConfig.domain) {
      return res.status(400).json({
        error: 'Either a valid presetKey or persona object with name & domain is required.',
      });
    }

    const result = await AgentManager.initializeAgent({ persona: personaConfig });

    if (env.NODE_ENV !== 'production') {
      logger.debug('[ENDPOINT] POST /api/agent/init completed successfully', { agentId: result.agentId });
    }

    return res.status(200).json(result);
  } catch (err) {
    logger.error('Error handling /api/agent/init endpoint', {}, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
