import { GateStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { expireGate, cancelGatesForSession } from "./monetization";
import { enqueue } from "../lib/queue";
import { logger } from "../lib/logger";
import { cleanupJobLogs } from "../lib/joblog";
import { config } from "../config";

// ============================================================
// Reliability recovery jobs — safety nets that reconcile state
// left behind by crashes, stuck workers or expired links.
// All of them are idempotent and safe to run on a schedule.
// ============================================================

async function numberSetting(key: string, fallback: number): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const n = Number(row?.value ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

// ── Monetization recovery ────────────────────────────────────

export async function recoverMonetization(): Promise<{ expired: number; cancelled: number }> {
  const now = new Date();
  const stale = await prisma.monetizationGate.findMany({
    where: {
      status: "PENDING",
      OR: [{ expiresAt: { lt: now } }, { session: { status: { in: ["ABANDONED", "COMPLETED"] } } }],
    },
    select: { id: true, sessionId: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  const sessionIds = [...new Set(stale.map((g) => g.sessionId))];
  const sessions = sessionIds.length
    ? await prisma.session.findMany({ where: { id: { in: sessionIds } }, select: { id: true, status: true } })
    : [];
  const statusById = new Map(sessions.map((s) => [s.id, s.status]));

  let expired = 0;
  let cancelled = 0;
  for (const g of stale) {
    try {
      const sessionStatus = statusById.get(g.sessionId);
      if (!sessionStatus || sessionStatus !== "ACTIVE") {
        await expireGate(g.id, GateStatus.CANCELLED, "session_closed");
        cancelled++;
      } else {
        await expireGate(g.id, GateStatus.EXPIRED, "stale_link");
        expired++;
      }
    } catch (err) {
      logger.warn("[recovery] gate recovery failed", (err as Error).message);
    }
  }
  return { expired, cancelled };
}

// ── Notification recovery ────────────────────────────────────

export async function recoverStuckNotifications(stuckMinutes = 15): Promise<number> {
  const cutoff = new Date(Date.now() - stuckMinutes * 60_000);
  const res = await prisma.notification.updateMany({
    where: { status: "SENDING", updatedAt: { lt: cutoff } },
    data: { status: "FAILED" },
  });
  return res.count;
}

// ── Campaign delivery recovery ───────────────────────────────
// Resets deliveries stuck in "sending" (worker crash mid-send) back
// to "queued" so the next dispatch batch picks them up.

export async function recoverStuckCampaignDeliveries(stuckMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - stuckMinutes * 60_000);
  const res = await prisma.campaignDelivery.updateMany({
    where: { status: "sending", updatedAt: { lt: cutoff } },
    data: { status: "queued" },
  });
  return res.count;
}

// ── Session recovery (safety net beyond the per-session sweep) ─

export async function recoverStuckSessions(): Promise<number> {
  const timeoutMinutes = await numberSetting("game.turnTimeoutMinutes", 5);
  const inviteExpiryMinutes = await numberSetting("game.inviteExpiryMinutes", 60);

  const cutoff = new Date(Date.now() - timeoutMinutes * 2 * 60_000);
  const inviteCutoff = new Date(Date.now() - inviteExpiryMinutes * 2 * 60_000);

  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { status: "ACTIVE", lastActivityAt: { lt: cutoff } },
        { status: "WAITING", createdAt: { lt: inviteCutoff } },
      ],
    },
    select: { id: true },
    take: 200,
  });

  for (const s of sessions) {
    await enqueue("game", "sweep", { sessionId: s.id }, { attempts: 1 }).catch(() => undefined);
  }
  if (sessions.length > 0) logger.info("[recovery] session sweep scheduled", { count: sessions.length });
  return sessions.length;
}

// ── Retention cleanup ────────────────────────────────────────

export async function runRetentionCleanup(): Promise<{ processedEvents: number; jobLogs: number }> {
  const processedEvents = await prisma.processedEvent
    .deleteMany({ where: { processedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } })
    .then((r) => r.count)
    .catch(() => 0);
  const jobLogs = await cleanupJobLogs(config.queue.jobLogRetentionDays);
  return { processedEvents, jobLogs };
}