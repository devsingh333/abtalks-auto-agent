import { app } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { AgentRepository } from './database/repositories/agent-repository';
import { JobRepository } from './database/repositories/job-repository';
import { autonomousWorker } from './agents/autonomous-worker';

async function bootstrap() {
  const server = app.listen(env.PORT, async () => {
    logger.info(`Autonomous AI Persona server listening on port ${env.PORT}`, { env: env.NODE_ENV });

    // Clear stale locks and restore active agent background workers
    try {
      await JobRepository.clearStaleLocks();
      const activeAgents = await AgentRepository.listActiveAgents();
      logger.info(`Restoring autonomous background workers for ${activeAgents.length} active agent(s)`);
      for (const agent of activeAgents) {
        await autonomousWorker.startWorkerForAgent(agent.id);
      }
    } catch (err) {
      logger.error('Failed to restore active agent workers on server startup', {}, err);
    }
  });

  const shutdown = () => {
    logger.info('Shutting down server gracefully...');
    server.close(() => {
      logger.info('Server stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();
