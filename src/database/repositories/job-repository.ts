import { prisma } from '../client';
import { Job } from '@prisma/client';

export class JobRepository {
  static async createJob(agentId: string, type: string): Promise<Job> {
    return prisma.job.create({
      data: {
        agentId,
        type,
        status: 'pending',
      },
    });
  }

  static async acquireLock(agentId: string, type: string): Promise<Job | null> {
    const running = await prisma.job.findFirst({
      where: {
        agentId,
        type,
        status: 'running',
      },
    });

    if (running) {
      // Check if job lock is stale (> 3 minutes old) from process restart
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      if (running.startedAt && running.startedAt < threeMinutesAgo) {
        await prisma.job.update({
          where: { id: running.id },
          data: { status: 'failed', error: 'Stale lock cleared' },
        });
      } else {
        // Lock currently held by active process
        return null;
      }
    }

    return prisma.job.create({
      data: {
        agentId,
        type,
        status: 'running',
        startedAt: new Date(),
      },
    });
  }

  static async clearStaleLocks(): Promise<void> {
    await prisma.job.updateMany({
      where: { status: 'running' },
      data: { status: 'failed', error: 'Server restart lock cleanup' },
    });
  }

  static async completeJob(jobId: string): Promise<Job> {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        finishedAt: new Date(),
      },
    });
  }

  static async failJob(jobId: string, error: string): Promise<Job> {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        error,
      },
    });
  }
}
