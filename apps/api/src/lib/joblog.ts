import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { logger } from "./logger";

// ============================================================
// Job logging — best effort record of background job outcomes.
// Used by /admin/jobs and failure alerting. Must never throw.
// ============================================================

export type JobLogEntry = {
  queue: string;
  jobName: string;
  jobId?: string;
  status: string;
  data?: Prisma.InputJsonValue;
  error?: string;
  attempts?: number;
  durationMs?: number;
  startedAt?: Date;
  finishedAt?: Date;
};

export async function recordJobLog(entry: JobLogEntry): Promise<void> {
  try {
    await prisma.jobLog.create({
      data: {
        queue: entry.queue,
        jobName: entry.jobName,
        jobId: entry.jobId ?? null,
        status: entry.status,
        data: (entry.data ?? null) as Prisma.InputJsonValue,
        error: entry.error ? entry.error.slice(0, 1000) : null,
        attempts: entry.attempts ?? 0,
        durationMs: entry.durationMs ?? null,
        startedAt: entry.startedAt ?? null,
        finishedAt: entry.finishedAt ?? null,
      },
    });
  } catch (err) {
    logger.warn("[joblog] write failed", (err as Error).message);
  }
}

export async function cleanupJobLogs(retentionDays: number): Promise<number> {
  try {
    const res = await prisma.jobLog.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - retentionDays * 86_400_000) } },
    });
    return res.count;
  } catch (err) {
    logger.warn("[joblog] cleanup failed", (err as Error).message);
    return 0;
  }
}