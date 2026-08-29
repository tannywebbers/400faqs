import { prisma } from "../lib/prisma";
import { getAllSettings, settingsToRecord, settingBool, settingNumber } from "./settings";
import { logger } from "../lib/logger";

// ============================================================
// Daily analytics snapshots.
//
// Captures a point-in-time cumulative view of platform metrics
// once per day so the admin analytics page can compare long-term
// trends. Snapshots are cheap single-row upserts keyed by day.
// ============================================================

export type SnapshotData = {
  totals: Record<string, number>;
  day: Record<string, number>;
};

export async function getSnapshotSettings() {
  const rows = await getAllSettings();
  const s = settingsToRecord(rows);
  return {
    enabled: settingBool(s, "analytics.snapshotEnabled", true),
    retentionDays: Math.max(1, settingNumber(s, "analytics.snapshotRetentionDays", 365)),
  };
}

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export async function captureAnalyticsSnapshot(force = false): Promise<void> {
  const settings = await getSnapshotSettings();
  if (!settings.enabled && !force) return;

  const startOfDay = dayStart(new Date());

  const [
    users, categories, questions, approvedQuestions, sessions, activeSessions, completedSessions,
    moves, contributions, approvedContributions, reports, categoryRequests, contactMessages, messageLogs,
    revenue, todayUsers, todaySessions, todayMoves, todayContributions, todayMessages,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.question.count(),
    prisma.question.count({ where: { status: "APPROVED" } }),
    prisma.session.count(),
    prisma.session.count({ where: { status: { in: ["WAITING", "ACTIVE"] } } }),
    prisma.session.count({ where: { status: "COMPLETED" } }),
    prisma.gameMove.count(),
    prisma.contribution.count(),
    prisma.contribution.count({ where: { status: "APPROVED" } }),
    prisma.questionReport.count(),
    prisma.categoryRequest.count(),
    prisma.contactMessage.count(),
    prisma.messageLog.count(),
    prisma.revenueLedger.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.session.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.gameMove.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.contribution.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.messageLog.count({ where: { createdAt: { gte: startOfDay } } }),
  ]);

  const revenueAgg = await prisma.revenueLedger.aggregate({
    _sum: { revenueAmount: true, payoutAmount: true },
  });

  const data: SnapshotData = {
    totals: {
      users,
      categories,
      questions,
      approvedQuestions,
      sessions,
      activeSessions,
      completedSessions,
      moves,
      contributions,
      approvedContributions,
      reports,
      categoryRequests,
      contactMessages,
      messageLogs,
      revenue: revenue + 0,
      revenueAmount: revenueAgg._sum.revenueAmount ?? 0,
      payoutAmount: revenueAgg._sum.payoutAmount ?? 0,
    },
    day: {
      users: todayUsers,
      sessions: todaySessions,
      moves: todayMoves,
      contributions: todayContributions,
      messages: todayMessages,
    },
  };

  await prisma.analyticsSnapshot.upsert({
    where: { date: startOfDay },
    update: { data: data as object },
    create: { date: startOfDay, data: data as object },
  });

  await cleanupSnapshots();
  logger.info("[snapshot] captured analytics snapshot", { date: startOfDay.toISOString().slice(0, 10) });
}

export async function getSnapshotSeries(days = 90) {
  const end = dayStart(new Date());
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const rows = await prisma.analyticsSnapshot.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, data: true },
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    totals: (r.data as SnapshotData).totals,
    day: (r.data as SnapshotData).day,
  }));
}

export async function getLatestSnapshot() {
  const row = await prisma.analyticsSnapshot.findFirst({ orderBy: { date: "desc" } });
  if (!row) return null;
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    totals: (row.data as SnapshotData).totals,
    day: (row.data as SnapshotData).day,
  };
}

export async function cleanupSnapshots(): Promise<number> {
  const settings = await getSnapshotSettings();
  const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000);
  const result = await prisma.analyticsSnapshot.deleteMany({ where: { date: { lt: cutoff } } });
  return result.count;
}