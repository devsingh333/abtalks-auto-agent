import rateLimit from 'express-rate-limit';

/** Global API Rate Limiter: Max 100 requests per 15 minutes per IP */
export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes.',
  },
});

/** Agent Creation Limiter: Max 5 agent creations per IP per hour */
export const agentInitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Agent creation rate limit exceeded. Maximum 5 agents initialized per hour per IP.',
  },
});

/** Cycle Trigger Limiter: Max 5 manual triggers per IP per 15 minutes */
export const cycleTriggerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Cycle trigger rate limit exceeded. Maximum 5 manual cycle triggers per 15 minutes.',
  },
});
