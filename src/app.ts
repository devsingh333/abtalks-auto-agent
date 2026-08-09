import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import { env } from './config/env';
import { logger } from './utils/logger';
import { globalApiLimiter, agentInitLimiter, cycleTriggerLimiter } from './middleware/rate-limiter';
import { adminAuthMiddleware } from './middleware/admin-auth';
import { handleInitAgent } from './api/agent-init.route';
import { handleGetAgentFeed } from './api/agent-feed.route';
import { handleHealth } from './api/health.route';
import {
  handleMonitorOverview,
  handleAgentDetails,
  handleMonitorActivity,
  handleMonitorPosts,
  handleAiLogs,
  handleAgentPause,
  handleAgentResume,
  handleAgentDelete,
  handleAgentTriggerCycle,
} from './api/monitor.route';

export const app = express();

// Public Permissive CORS Configuration for Open Third-Party API Access
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: false,
  })
);

app.use(express.json({ limit: '2mb' }));

// Global Rate Limiting for all API routes
app.use('/api/', globalApiLimiter);

// Endpoint Development Logging Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    if (env.NODE_ENV !== 'production') {
      const durationMs = Date.now() - startTime;
      logger.debug(`[HTTP ${req.method}] ${req.originalUrl || req.url} - ${res.statusCode} (${durationMs}ms)`, {
        method: req.method,
        path: req.path,
        query: req.query,
        statusCode: res.statusCode,
        durationMs,
        bodySummary: req.body?.persona ? { personaName: req.body.persona.name, domain: req.body.persona.domain } : undefined,
      });
    }
  });

  next();
});

// Primary API Routes
app.all('/api/agent/init', agentInitLimiter, handleInitAgent);
app.get('/api/agent/feed', handleGetAgentFeed);
app.get('/health', handleHealth);

// Monitoring API Routes
app.get('/api/monitor/overview', handleMonitorOverview);
app.get('/api/monitor/agent/:id/details', handleAgentDetails);
app.get('/api/monitor/activity', handleMonitorActivity);
app.get('/api/monitor/posts', handleMonitorPosts);
app.get('/api/monitor/ai-logs', handleAiLogs);
app.post('/api/monitor/agent/:id/pause', adminAuthMiddleware, handleAgentPause);
app.post('/api/monitor/agent/:id/resume', adminAuthMiddleware, handleAgentResume);
app.delete('/api/monitor/agent/:id', adminAuthMiddleware, handleAgentDelete);
app.post('/api/monitor/agent/:id/trigger', cycleTriggerLimiter, adminAuthMiddleware, handleAgentTriggerCycle);

// Serve dashboard static files on root / and /monitor
app.use(express.static(path.join(__dirname, '..', 'monitor')));
app.use('/monitor', express.static(path.join(__dirname, '..', 'monitor')));

// 404 Not Found Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global Express Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled API Error in Express middleware pipeline', {
    path: req.path,
    method: req.method,
    error: err?.message || String(err),
    stack: err?.stack,
  });

  // Handle Bad JSON syntax errors from body-parser
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    return res.status(400).json({ error: 'Malformed JSON payload in request body' });
  }

  const statusCode = typeof err?.status === 'number' ? err.status : typeof err?.statusCode === 'number' ? err.statusCode : 500;
  const errorMessage = err?.message || 'An unexpected internal server error occurred';

  return res.status(statusCode).json({
    error: errorMessage,
    timestamp: new Date().toISOString(),
  });
});
