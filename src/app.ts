import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import { env } from './config/env';
import { logger } from './utils/logger';
import { handleInitAgent } from './api/agent-init.route';
import { handleGetAgentFeed } from './api/agent-feed.route';
import { handleHealth } from './api/health.route';
import { handleMonitorOverview, handleAgentDetails, handleMonitorActivity, handleMonitorPosts, handleAgentPause, handleAgentResume, handleAgentDelete, handleAgentTriggerCycle } from './api/monitor.route';

export const app = express();

app.use(cors());
app.use(express.json());

// Endpoint Development Logging Middleware (Active when NODE_ENV !== 'production')
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

// Serve dashboard static files on root / and /monitor
app.use(express.static(path.join(__dirname, '..', 'monitor')));
app.use('/monitor', express.static(path.join(__dirname, '..', 'monitor')));

// Routes
app.post('/api/agent/init', handleInitAgent);
app.get('/api/agent/feed', handleGetAgentFeed);
app.get('/health', handleHealth);

// Monitoring API Routes
app.get('/api/monitor/overview', handleMonitorOverview);
app.get('/api/monitor/agent/:id/details', handleAgentDetails);
app.get('/api/monitor/activity', handleMonitorActivity);
app.get('/api/monitor/posts', handleMonitorPosts);
app.post('/api/monitor/agent/:id/pause', handleAgentPause);
app.post('/api/monitor/agent/:id/resume', handleAgentResume);
app.delete('/api/monitor/agent/:id', handleAgentDelete);
app.post('/api/monitor/agent/:id/trigger', handleAgentTriggerCycle);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});
