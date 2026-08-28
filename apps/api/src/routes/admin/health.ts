import { Router } from "express";
import { ok } from "../../lib/response";
import { getSystemStatus } from "../../services/status";
import { getAllQueueCounts } from "../../lib/queue";
import { prisma } from "../../lib/prisma";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const [status, queues] = await Promise.all([getSystemStatus(), getAllQueueCounts()]);
  res.json(ok({ ...status, queues }));
});

healthRouter.get("/system-events", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const events = await prisma.systemEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const unhealthy = await prisma.systemEvent.count({ where: { status: { in: ["degraded", "down"] } } });
  res.json(ok({ events, unhealthy }));
});

healthRouter.get("/counts", async (_req, res) => {
  const [users, categories, questions, pendingQuestions, contributions, pendingContributions, sessions, activeSessions, openReports, pendingRequests, pendingNotifications] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.question.count(),
    prisma.question.count({ where: { status: "PENDING" } }),
    prisma.contribution.count(),
    prisma.contribution.count({ where: { status: "PENDING" } }),
    prisma.session.count(),
    prisma.session.count({ where: { status: { in: ["WAITING", "ACTIVE"] } } }),
    prisma.questionReport.count({ where: { status: "OPEN" } }),
    prisma.categoryRequest.count({ where: { status: "PENDING" } }),
    prisma.notification.count({ where: { status: "PENDING" } }),
  ]);
  res.json(ok({
    users, categories, questions, pendingQuestions, contributions, pendingContributions,
    sessions, activeSessions, openReports, pendingRequests, pendingNotifications,
  }));
});