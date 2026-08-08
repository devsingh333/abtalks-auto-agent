import { JobRepository } from '../database/repositories/job-repository';
import { Job } from '@prisma/client';
import { logger } from '../utils/logger';

export class WorkerLock {
  static async acquire(agentId: string, type: string): Promise<Job | null> {
    try {
      return await JobRepository.acquireLock(agentId, type);
    } catch (err) {
      logger.warn('Failed to acquire worker lock', { agentId, type, err });
      return null;
    }
  }

  static async release(jobId: string, success: boolean, errorMsg?: string): Promise<void> {
    try {
      if (success) {
        await JobRepository.completeJob(jobId);
      } else {
        await JobRepository.failJob(jobId, errorMsg || 'Unknown error');
      }
    } catch (err) {
      logger.error('Failed to release worker lock', { jobId, err });
    }
  }
}
