import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Admin Authentication Middleware
 * Protects agent management actions (pause, resume, delete, manual cycle trigger).
 * If ADMIN_API_KEY is configured in .env, checks header 'x-admin-key', query 'adminKey', or body 'adminKey'.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // If ADMIN_API_KEY is not set or empty, allow management actions
  if (!env.ADMIN_API_KEY || env.ADMIN_API_KEY.trim() === '') {
    return next();
  }

  const providedKey =
    (req.headers['x-admin-key'] as string) ||
    (req.query.adminKey as string) ||
    req.body?.adminKey;

  if (providedKey !== env.ADMIN_API_KEY) {
    logger.warn('Unauthorized agent management attempt rejected', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    return res.status(401).json({
      error: 'Unauthorized: Valid admin password / key required to pause, resume, trigger, or delete agents.',
    });
  }

  next();
}
