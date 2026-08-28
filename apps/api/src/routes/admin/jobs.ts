import { Router } from "express";
import { ok, AppError } from "../../lib/response";
import { QUEUE_LIST, getAllQueueCounts, getRecentJobs, retryJob, type RecentJob } from "../../lib/queue";
import { logAudit } from "../../lib/audit";
import type { AdminRequest } from "../../middleware/auth";

export const jobsRouter = Router();

const JOB_STATES = ["completed", "failed", "waiting", "active", "delayed", "paused"] as const;

// Only widely-administered states are exposed to avoid giant payloads.
const DEFAULT_STATES = ["failed", "active"] as const;

jobsRouter.get("/", async (req, res) => {
  const queues = await getAllQueueCounts();

  const queue = String(req.query.queue ?? "").trim();
  const rawState = String(req.query.state ?? "failed").trim();
  const page = Math.max(Number(req.query.page ?? 1), 1);

  let recent: RecentJob[] = [];
  let states: string[] = [];
  if (queue && QUEUE_LIST.includes(queue as (typeof QUEUE_LIST)[number])) {
    states = rawState
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is string => (JOB_STATES as readonly string[]).includes(s));
    if (states.length === 0) states = [...DEFAULT_STATES];
    recent = await getRecentJobs(queue as (typeof QUEUE_LIST)[number], states, (page - 1) * 30, page * 30);
  }

  res.json(ok({ queues, recent, queue, states, page }));
});

jobsRouter.post("/:queue/:id/retry", async (req, res) => {
  const queue = req.params.queue;
  if (!QUEUE_LIST.includes(queue as (typeof QUEUE_LIST)[number])) {
    throw new AppError(400, `Unknown queue. Allowed: ${QUEUE_LIST.join(", ")}`);
  }
  const id = req.params.id;
  const okResult = await retryJob(queue as (typeof QUEUE_LIST)[number], id);
  if (!okResult) throw new AppError(404, "Job not found in queue");

  const admin = (req as unknown as AdminRequest).admin;
  logAudit({ adminId: admin.id, action: "job.retry", targetType: "job", targetId: id, details: { queue } });
  res.json(ok({ message: "Job requeued for retry", queue, id }));
});