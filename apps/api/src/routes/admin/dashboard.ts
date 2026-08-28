import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { ok } from "../../lib/response";
import { getDashboardStats, getAnalyticsSeries, getTopCategories } from "../../services/analytics";
import { getAllQueueCounts } from "../../lib/queue";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (_req, res) => {
  res.json(ok(await getDashboardStats()));
});

dashboardRouter.get("/ops", async (_req, res) => {
  const [queues, pendingNotifications, failedNotifications, stuckNotifications, recentEvents] = await Promise.all([
    getAllQueueCounts(),
    prisma.notification.count({ where: { status: "PENDING" } }),
    prisma.notification.count({ where: { status: "FAILED" } }),
    prisma.notification.count({ where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } } }),
    prisma.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  res.json(ok({ queues, moderationQueue: { pendingNotifications, failedNotifications, stuckNotifications }, recentEvents }));
});

dashboardRouter.get("/stats", async (_req, res) => {
  res.json(ok(await getDashboardStats()));
});

dashboardRouter.get("/analytics", async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 30), 90);
  res.json(ok(await getAnalyticsSeries(days)));
});

dashboardRouter.get("/top-categories", async (req, res) => {
  res.json(ok(await getTopCategories(Number(req.query.limit ?? 10))));
});

dashboardRouter.get("/sessions", async (req, res) => {
  const [total, active, completed, abandoned, waiting] = await Promise.all([
    prisma.session.count(),
    prisma.session.count({ where: { status: "ACTIVE" } }),
    prisma.session.count({ where: { status: "COMPLETED" } }),
    prisma.session.count({ where: { status: "ABANDONED" } }),
    prisma.session.count({ where: { status: "WAITING" } }),
  ]);
  res.json(ok({ total, active, completed, abandoned, waiting }));
});
