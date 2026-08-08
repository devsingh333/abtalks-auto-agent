import { Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function handleHealth(req: Request, res: Response) {
  if (env.NODE_ENV !== 'production') {
    logger.debug('[ENDPOINT] Processing GET /health request');
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
