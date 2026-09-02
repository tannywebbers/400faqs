import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { ok } from "../../lib/response";
import { cacheGet, cacheSet } from "../../lib/redis";
import { getDashboardStats, getAnalyticsSeries, getTopCategories } from "../../services/analytics";
import { getAllQueueCounts } from "../../lib/queue";

export const dashboardRouter = Router();

// Admin aggregate endpoints are heavy (multiple counts / trend queries on the
// whole dataset). Cache the results so the dashboard renders in milliseconds
// instead of re-running aggregates on every click. Cache falls back to the
// in-memory store in degraded mode, so this stays fast even without Redis.
async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit) return hit;
  const value = await fn();
  await cacheSet(key, value, ttlSeconds);
  return value;
}

dashboardRouter.get("/", async (_req, res) => {
  res.json(ok(await cached("cache:admin:dashboard", 60, getDashboardStats)));
});

dashboardRouter.get("/ops", async (_req, res) => {
  const value = await cached("cache:admin:dashboard:ops", 15, async () => {
    const [queues, pendingNotifications, failedNotifications, stuckNotifications, recentEvents] = await Promise.all([
      getAllQueueCounts(),
      prisma.notification.count({ where: { status: "PENDING" } }),
      prisma.notification.count({ where: { status: "FAILED" } }),
      prisma.notification.count({ where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } } }),
      prisma.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    return { queues, moderationQueue: { pendingNotifications, failedNotifications, stuckNotifications }, recentEvents };
  });
  res.json(ok(value));
});

dashboardRouter.get("/stats", async (_req, res) => {
  res.json(ok(await cached("cache:admin:dashboard", 60, getDashboardStats)));
});

dashboardRouter.get("/analytics", async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 30), 90);
  res.json(ok(await cached(`cache:admin:dashboard:analytics:${days}`, 120, () => getAnalyticsSeries(days))));
});

dashboardRouter.get("/top-categories", async (req, res) => {
  const limit = Number(req.query.limit ?? 10);
  res.json(ok(await cached(`cache:admin:dashboard:top-categories:${limit}`, 120, () => getTopCategories(limit))));
});

dashboardRouter.get("/sessions", async (_req, res) => {
  const value = await cached("cache:admin:dashboard:sessions", 60, async () => {
    const [total, active, completed, abandoned, waiting] = await Promise.all([
      prisma.session.count(),
      prisma.session.count({ where: { status: "ACTIVE" } }),
      prisma.session.count({ where: { status: "COMPLETED" } }),
      prisma.session.count({ where: { status: "ABANDONED" } }),
      prisma.session.count({ where: { status: "WAITING" } }),
    ]);
    return { total, active, completed, abandoned, waiting };
  });
  res.json(ok(value));
});
