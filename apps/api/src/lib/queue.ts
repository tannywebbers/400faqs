import { Queue, Worker, type Job } from "bullmq";
import { getRedis } from "./redis";

export const QUEUES = {
  moderation: "moderation",
  game: "game",
  notification: "notification",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export function getQueue(name: QueueName): Queue {
  return new Queue(name, { connection: getRedis() });
}

export async function enqueue(name: QueueName, jobName: string, data: unknown, opts?: { delay?: number; attempts?: number; jobId?: string }): Promise<string | undefined> {
  const q = getQueue(name);
  const job = await q.add(jobName, data, {
    delay: opts?.delay ?? 0,
    attempts: opts?.attempts ?? 3,
    backoff: { type: "exponential", delay: 2000 },
    jobId: opts?.jobId,
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  return job.id;
}

export function createWorker(name: QueueName, processor: (job: Job) => Promise<void>): Worker {
  const worker = new Worker(name, processor, { connection: getRedis(), concurrency: 4 });
  worker.on("failed", (job, err) => {
    console.error(`[queue:${name}] job failed`, job?.name, err.message);
  });
  return worker;
}
