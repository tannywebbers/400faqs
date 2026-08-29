import { Queue, Worker, type Job, type JobType } from "bullmq";
import type { Prisma } from "@prisma/client";
import { getRedis } from "./redis";
import { config } from "../config";
import { recordJobLog } from "./joblog";
import { logger } from "./logger";

export const QUEUES = {
  moderation: "moderation",
  game: "game",
  notification: "notification",
  snapshot: "snapshot",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const QUEUE_LIST: QueueName[] = Object.values(QUEUES);

export function getQueue(name: QueueName): Queue {
  return new Queue(name, { connection: getRedis() });
}

export async function enqueue(
  name: QueueName,
  jobName: string,
  data: unknown,
  opts?: { delay?: number; attempts?: number; jobId?: string }
): Promise<string | undefined> {
  const q = getQueue(name);
  const job = await q.add(jobName, data, {
    delay: opts?.delay ?? 0,
    attempts: opts?.attempts ?? config.queue.defaultAttempts,
    backoff: { type: "exponential", delay: config.queue.backoffDelayMs },
    jobId: opts?.jobId,
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  return job.id;
}

function recordJobOutcome(job: Job, status: string, error?: string): void {
  recordJobLog({
    queue: job.queueName,
    jobName: job.name ?? "",
    jobId: job.id,
    status,
    data: (job.data ?? null) as Prisma.InputJsonValue,
    error,
    attempts: job.attemptsMade,
    durationMs: job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : undefined,
    startedAt: job.processedOn ? new Date(job.processedOn) : undefined,
    finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
  });
}

export function createWorker(
  name: QueueName,
  processor: (job: Job) => Promise<void>
): Worker {
  const worker = new Worker(name, processor, { connection: getRedis(), concurrency: config.queue.concurrency });

  worker.on("completed", (job) => {
    if (job.name === "sweep") return;
    recordJobOutcome(job, "completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(`[queue:${name}] job failed`, { job: job?.name, attempts: job?.attemptsMade, error: err.message });
    if (job) recordJobOutcome(job as unknown as Job, "failed", err.message);
  });

  return worker;
}

// ============================================================
// Queue health metrics for /admin/health and /admin/jobs
// ============================================================

export type QueueCounts = {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
};

export async function getQueueCounts(name: QueueName): Promise<QueueCounts> {
  try {
    const q = getQueue(name);
    const counts = await q.getJobCounts("waiting", "active", "completed", "failed", "delayed", "paused");
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused: counts.paused ?? 0,
    };
  } catch (err) {
    logger.warn("[queue] metric read failed", { name, error: (err as Error).message });
    return { waiting: -1, active: -1, completed: -1, failed: -1, delayed: -1, paused: -1 };
  }
}

export async function getAllQueueCounts(): Promise<Record<string, QueueCounts>> {
  const out: Record<string, QueueCounts> = {};
  for (const name of QUEUE_LIST) {
    out[name] = await getQueueCounts(name);
  }
  return out;
}

export type RecentJob = {
  id: string;
  name: string;
  queue: string;
  status: string;
  attempts: number;
  timestamp: number | null;
  error?: string;
  data?: unknown;
};

export async function getRecentJobs(
  name: QueueName,
  statuses: string[],
  start: number,
  end: number
): Promise<RecentJob[]> {
  try {
    const q = getQueue(name);
    const jobs = await q.getJobs(statuses as JobType[], start, end);
    return jobs.map((job) => ({
      id: job.id ?? "",
      name: job.name ?? "",
      queue: name,
      status: job.failedReason ? "failed" : statuses[0],
      attempts: job.attemptsMade,
      timestamp: job.finishedOn ?? job.timestamp,
      error: job.failedReason ?? undefined,
      data: job.data,
    }));
  } catch (err) {
    logger.warn("[queue] recent jobs read failed", { name, error: (err as Error).message });
    return [];
  }
}

export async function getJobByIdentifier(name: QueueName, id: string): Promise<Job | null> {
  try {
    const q = getQueue(name);
    return (await q.getJob(id)) ?? null;
  } catch {
    return null;
  }
}

export async function retryJob(name: QueueName, id: string): Promise<boolean> {
  try {
    const q = getQueue(name);
    const job = await q.getJob(id);
    if (!job) return false;
    await job.retry();
    return true;
  } catch (err) {
    logger.warn("[queue] retry failed", { name, id, error: (err as Error).message });
    return false;
  }
}