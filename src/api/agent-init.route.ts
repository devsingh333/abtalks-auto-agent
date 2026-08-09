import { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { AgentManager } from '../agents/agent-manager';
import { ORIGINAL_AI_PERSONAS } from '../agents/persona-presets';
import { logger } from '../utils/logger';

const initSchema = z.object({
  presetKey: z.string().max(50).optional(),
  persona: z
    .object({
      name: z.string().min(1, 'Persona name is required').max(100, 'Name must be at most 100 characters'),
      role: z.string().max(150, 'Role must be at most 150 characters').optional(),
      domain: z.string().min(1, 'Persona domain is required').max(100, 'Domain must be at most 100 characters'),
      identity: z.string().max(1000, 'Identity text must be at most 1000 characters').optional(),
      interests: z.array(z.string().max(100)).max(20, 'At most 20 interests allowed').optional(),
      avoid: z.array(z.string().max(100)).max(20, 'At most 20 avoid topics allowed').optional(),
      editorialPrinciples: z.array(z.string().max(150)).max(15, 'At most 15 editorial principles allowed').optional(),
      voice: z
        .object({
          tone: z.string().max(100).optional(),
          length: z.string().max(100).optional(),
          style: z.string().max(100).optional(),
          stance: z.string().max(150).optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function handleInitAgent(req: Request, res: Response) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        message: 'Send a POST request to /api/agent/init to initialize an autonomous AI persona.',
        availablePresets: Object.keys(ORIGINAL_AI_PERSONAS).map((key) => ({
          presetKey: key,
          name: ORIGINAL_AI_PERSONAS[key].name,
          role: ORIGINAL_AI_PERSONAS[key].role,
          domain: ORIGINAL_AI_PERSONAS[key].domain,
        })),
        samplePayload: {
          presetKey: 'ai_security',
        },
      });
    }

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
  } catch (err: any) {
    logger.error('Error handling /api/agent/init endpoint', {}, err);
    return res.status(400).json({ error: err.message || 'Internal server error' });
  }
}
