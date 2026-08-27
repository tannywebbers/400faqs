import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { enqueue } from "../lib/queue";
import { getAllSettings, settingsToRecord, settingBool, settingNumber } from "./settings";
import { sendTextMessage } from "./messaging";
import { incrementTemplateUsage } from "./template.service";
import { logger } from "../lib/logger";

// ============================================================
// Marketing campaigns.
//
// Owns: audience resolution, campaign lifecycle
// (DRAFT -> SCHEDULED / RUNNING -> COMPLETED / CANCELLED),
// rate-limited dispatch through the BullMQ "campaign" queue and
// per-recipient delivery tracking.
//
// Dispatch model:
//   - Each campaign-run resolves recipients into CampaignDelivery rows.
//   - A "dispatch" job pulls up to `rateLimitPerMinute` queued
//     deliveries, sends them, then re-schedules itself after 60s,
//     which caps outbound throughput (WhatsApp protection).
//   - Delivery receipt statuses (delivered/read) are applied from the
//     incoming webhook via MessageLog.campaignDeliveryId.
// ============================================================

export type CampaignSettings = {
  autoProcess: boolean;
  defaultRateLimitPerMinute: number;
  maxRecipients: number;
};

export async function getCampaignSettings(): Promise<CampaignSettings> {
  const rows = await getAllSettings();
  const s = settingsToRecord(rows);
  return {
    autoProcess: settingBool(s, "campaign.autoProcess", true),
    defaultRateLimitPerMinute: clampInt(settingNumber(s, "campaign.rateLimitPerMinute", 60), 1, 100000),
    maxRecipients: clampInt(settingNumber(s, "campaign.maxRecipients", 5000), 1, 1000000),
  };
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

// ============================================================
// Cron (lightweight) support for recurring campaigns
// ============================================================

function fieldMatchesPart(value: number, part: string): boolean {
  if (part === "*") return true;
  const stepMatch = part.match(/^(\d+|\*)-(\d+)(?:\/(\d+))?$/) ?? part.match(/^(\d+)(?:\/)?(?:\/(\d+))?$/) ?? null;
  if (/^\d+$/.test(part)) return Number(part) === value;
  if (part.startsWith("*/")) {
    const step = Number(part.slice(2));
    return step > 0 && value % step === 0;
  }
  const m = part.split("/");
  if (m.length !== 2) return false;
  const step = Number(m[1]);
  if (!Number.isFinite(step) || step <= 0) return false;
  const range = m[0];
  if (range === "*") return value % step === 0;
  const [a, b] = range.split("-");
  const na = Number(a);
  const nb = Number.isFinite(Number(b)) ? Number(b) : na;
  return value >= na && value <= nb && (value - na) % step === 0;
}

function fieldMatches(value: number, expr: string): boolean {
  return expr.split(",").some((part) => {
    const trimmed = part.trim();
    if (!trimmed) return false;
    try {
      return fieldMatchesPart(value, trimmed);
    } catch {
      return false;
    }
  });
}

/** Compute the next time a 5-field cron expression fires, scanning minute-by-minute (max 1 year out). */
export function nextCronRun(expression: string, from: Date): Date | null {
  const expr = expression.trim().split(/\s+/);
  if (expr.length !== 5) return null;
  const [minuteE, hourE, domE, monthE, dowE] = expr;
  // Month ignored (treated as *).
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  const cap = 525600; // 1 year in minutes
  for (let i = 0; i < cap; i++) {
    cursor.setMinutes(cursor.getMinutes() + 1);
    const dom = cursor.getDate();
    const dow = cursor.getDay();
    const domOk = domE === "*" || fieldMatches(dom, domE);
    const dowOk = dowE === "*" || fieldMatches(dow === 0 ? 7 : dow, dowE);
    // Standard cron: dom and dow are OR'd when both restricted.
    const dayOk = domE === "*" || dowE === "*" ? domOk && dowOk : domOk || dowOk;
    if (dayOk && fieldMatches(cursor.getHours(), hourE) && fieldMatches(cursor.getMinutes(), minuteE)) {
      return cursor;
    }
  }
  return null;
}

function computeNextRun(campaign: { scheduleType: string; scheduledAt: Date | null; cronExpression: string | null }): Date | null {
  if (campaign.scheduleType === "scheduled" && campaign.scheduledAt) return campaign.scheduledAt;
  if (campaign.scheduleType === "recurring" && campaign.cronExpression) {
    try {
      return nextCronRun(campaign.cronExpression, new Date());
    } catch {
      return null;
    }
  }
  return null;
}

// ============================================================
// Audience resolution
// ============================================================

export type AudienceMember = { userId: string | null; phone: string };

function filterNumber(filter: Record<string, unknown>, key: string, fallback: number): number {
  const v = Number(filter[key]);
  return Number.isFinite(v) ? v : fallback;
}

function filterPhones(filter: Record<string, unknown>): string[] {
  const v = filter.phones;
  if (Array.isArray(v)) return v.map((p) => String(p)).filter(Boolean);
  if (typeof v === "string") return v.split(",").map((p) => p.trim().replace(/\D/g, "")).filter(Boolean);
  return [];
}

async function membersFromIds(ids: string[], max: number): Promise<AudienceMember[]> {
  if (ids.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids.slice(0, max) }, status: "ACTIVE" },
    select: { id: true, phone: true },
  });
  return users.map((u) => ({ userId: u.id, phone: u.phone }));
}

export async function resolveAudience(campaign: {
  audience: string;
  audienceFilter: unknown;
  maxRecipients: number;
}): Promise<AudienceMember[]> {
  const filter = (campaign.audienceFilter && typeof campaign.audienceFilter === "object" ? campaign.audienceFilter : {}) as Record<string, unknown>;
  const max = campaign.maxRecipients > 0 ? campaign.maxRecipients : 5000;

  switch (campaign.audience) {
    case "active_users": {
      const days = Math.max(1, Math.floor(filterNumber(filter, "lastActiveDays", 30)));
      const cutoff = new Date(Date.now() - days * 86_400_000);
      const users = await prisma.user.findMany({
        where: { status: "ACTIVE", lastSeenAt: { gte: cutoff } },
        select: { id: true, phone: true },
        orderBy: { lastSeenAt: "desc" },
        take: max,
      });
      return users.map((u) => ({ userId: u.id, phone: u.phone }));
    }
    case "players": {
      const minSessions = Math.max(1, Math.floor(filterNumber(filter, "minSessions", 1)));
      const days = Math.max(1, Math.floor(filterNumber(filter, "lastActiveDays", 90)));
      const cutoff = new Date(Date.now() - days * 86_400_000);
      const sessions = await prisma.session.findMany({
        where: { status: "COMPLETED", updatedAt: { gte: cutoff } },
        select: { creatorId: true, joinerId: true },
      });
      const counts = new Map<string, number>();
      for (const s of sessions) {
        for (const id of [s.creatorId, s.joinerId]) {
          if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }
      const ids = [...counts.entries()].filter(([, c]) => c >= minSessions).map(([id]) => id);
      return membersFromIds(ids, max);
    }
    case "contributors": {
      const minContributions = Math.max(1, Math.floor(filterNumber(filter, "minContributions", 1)));
      const groups = await prisma.contribution.groupBy({ by: ["userId"], where: { userId: { not: null } }, _count: { _all: true } });
      const ids = groups.filter((g) => g.userId && g._count._all >= minContributions).map((g) => g.userId as string);
      return membersFromIds(ids, max);
    }
    case "specific_users": {
      const phones = filterPhones(filter);
      const users = await prisma.user.findMany({
        where: { phone: { in: phones.slice(0, max) }, status: "ACTIVE" },
        select: { id: true, phone: true },
      });
      return users.map((u) => ({ userId: u.id, phone: u.phone }));
    }
    case "seed_invites": {
      const sessions = await prisma.session.findMany({ where: { status: "WAITING" }, select: { creatorId: true } });
      return membersFromIds(sessions.map((s) => s.creatorId), max);
    }
    case "all_users":
    default: {
      const users = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, phone: true },
        orderBy: { lastSeenAt: "desc" },
        take: max,
      });
      return users.map((u) => ({ userId: u.id, phone: u.phone }));
    }
  }
}

// ============================================================
// Lifecycle
// ============================================================

export async function startCampaign(id: string): Promise<{ ok: boolean; message: string; total: number }> {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return { ok: false, message: "Campaign not found", total: 0 };
  if (campaign.status === "RUNNING") return { ok: false, message: "Campaign is already running", total: campaign.totalRecipients };

  const settings = await getCampaignSettings();
  const rawRecipients = await resolveAudience({
    audience: campaign.audience,
    audienceFilter: campaign.audienceFilter as Prisma.InputJsonValue | undefined,
    maxRecipients: settings.maxRecipients,
  });

  const seen = new Set<string>();
  const recipients: AudienceMember[] = [];
  for (const r of rawRecipients) {
    const key = r.phone;
    if (!seen.has(key)) {
      seen.add(key);
      recipients.push(r);
      if (recipients.length >= settings.maxRecipients) break;
    }
  }

  const nextRun = computeNextRun(campaign);
  await prisma.$transaction(async (tx) => {
    await tx.campaignDelivery.deleteMany({ where: { campaignId: id } });
    if (recipients.length > 0) {
      await tx.campaignDelivery.createMany({
        data: recipients.map((r) => ({ campaignId: id, userId: r.userId, phone: r.phone, status: "queued" })),
      });
    }
    await tx.campaign.update({
      where: { id },
      data: {
        status: "RUNNING",
        totalRecipients: recipients.length,
        sentCount: 0,
        deliveredCount: 0,
        readCount: 0,
        failedCount: 0,
        skippedCount: 0,
        lastRunAt: new Date(),
        nextRunAt: nextRun,
      },
    });
  });

  if (recipients.length > 0) {
    await enqueue("campaign", "dispatch", { campaignId: id }, { attempts: 1, jobId: `campaign-${id}` });
  } else {
    await completeCampaign(id);
    return { ok: true, message: "Campaign had no recipients, marked complete", total: 0 };
  }

  logger.info("[campaign] started", { campaignId: id, recipients: recipients.length });
  return { ok: true, message: `Campaign started — ${recipients.length} recipient${recipients.length === 1 ? "" : "s"}`, total: recipients.length };
}

export async function pauseCampaign(id: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "RUNNING" && campaign.status !== "SCHEDULED") throw new Error("Only running or scheduled campaigns can be paused");
  await prisma.campaign.update({ where: { id }, data: { status: "PAUSED" } });
}

export async function resumeCampaign(id: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "PAUSED") throw new Error("Only paused campaigns can be resumed");
  await prisma.campaign.update({ where: { id }, data: { status: "RUNNING" } });
  await enqueue("campaign", "dispatch", { campaignId: id }, { attempts: 1, jobId: `campaign-${id}` });
}

export async function cancelCampaign(id: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status === "COMPLETED" || campaign.status === "CANCELLED") throw new Error("Campaign already finished");
  await prisma.$transaction([
    prisma.campaign.update({ where: { id }, data: { status: "CANCELLED", nextRunAt: null } }),
    prisma.campaignDelivery.updateMany({ where: { campaignId: id, status: "queued" }, data: { status: "skipped" } }),
  ]);
  await prisma.campaign.update({ where: { id }, data: { skippedCount: { increment: 1 } } }).catch(() => undefined);
}

export async function completeCampaign(id: string): Promise<void> {
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return;
  const nextRun = computeNextRun({ ...campaign, scheduledAt: null });
  if (campaign.scheduleType === "recurring" && nextRun) {
    await prisma.campaign.update({ where: { id }, data: { status: "SCHEDULED", nextRunAt: nextRun } });
  } else {
    await prisma.campaign.update({ where: { id }, data: { status: "COMPLETED", nextRunAt: null } });
  }
}

/** Cron entry point: promote due SCHEDULED campaigns to RUNNING. */
export async function advanceDueCampaigns(): Promise<number> {
  const settings = await getCampaignSettings();
  if (!settings.autoProcess) return 0;
  const now = new Date();
  const due = await prisma.campaign.findMany({ where: { status: "SCHEDULED", nextRunAt: { lte: now } }, select: { id: true } });
  for (const c of due) {
    await enqueue("campaign", "start", { campaignId: c.id }, { attempts: 1, jobId: `campaign-start-${c.id}` });
  }
  return due.length;
}

// ============================================================
// Dispatch
// ============================================================

async function updateCampaignCounts(campaignId: string, event: string): Promise<void> {
  const num: Record<string, number> = {};
  if (event === "sent") num.sentCount = 1;
  else if (event === "failed") num.failedCount = 1;
  else if (event === "delivered") num.deliveredCount = 1;
  else if (event === "read") num.readCount = 1;
  if (Object.keys(num).length === 0) return;
  await prisma.campaign.update({ where: { id: campaignId }, data: num }).catch((err) => logger.warn("[campaign] count update failed", (err as Error).message));
}

async function sendDelivery(
  campaign: { id: string; messageType: string; messageBody: string | null; templateId: string | null; template: { body: string } | null },
  delivery: { id: string; phone: string; userId: string | null; attempt: number }
): Promise<void> {
  const attempt = delivery.attempt + 1;
  let body = campaign.messageBody?.trim() || campaign.template?.body?.trim() || "";
  if (!body) {
    await prisma.campaignDelivery.update({ where: { id: delivery.id }, data: { status: "failed", error: "No message content", attempt } });
    await updateCampaignCounts(campaign.id, "failed");
    return;
  }

  const result = await sendTextMessage(delivery.phone, body, {
    userId: delivery.userId ?? undefined,
    templateId: campaign.templateId ?? undefined,
  });

  if (result.ok) {
    await incrementTemplateUsage(campaign.templateId);
    const latestLog = await prisma.messageLog.findFirst({
      where: { phone: delivery.phone, direction: "outbound" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const patch: Prisma.CampaignDeliveryUpdateInput = { status: "sent", sentAt: new Date(), attempt };
    if (latestLog) {
      patch.messageLogId = latestLog.id;
      await prisma.messageLog.update({ where: { id: latestLog.id }, data: { campaignDeliveryId: delivery.id } });
    }
    await prisma.campaignDelivery.update({ where: { id: delivery.id }, data: patch });
    await updateCampaignCounts(campaign.id, "sent");
  } else {
    await prisma.campaignDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", error: result.error ?? "send failed", attempt },
    });
    await updateCampaignCounts(campaign.id, "failed");
  }
}

/**
 * Process one batch of queued deliveries for a campaign (up to the
 * per-minute rate cap). Re-schedules itself after 60s when work remains.
 */
export async function processCampaignBatch(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: { select: { body: true } } },
  });
  if (!campaign || campaign.status !== "RUNNING") return 0;

  const settings = await getCampaignSettings();
  const cap = campaign.rateLimitPerMinute > 0 ? campaign.rateLimitPerMinute : settings.defaultRateLimitPerMinute;

  const batch = await prisma.campaignDelivery.findMany({
    where: { campaignId, status: "queued" },
    orderBy: { createdAt: "asc" },
    take: cap,
  });

  if (batch.length === 0) {
    const remaining = await prisma.campaignDelivery.count({ where: { campaignId, status: { in: ["queued", "scheduled"] } } });
    if (remaining === 0) await completeCampaign(campaignId);
    return 0;
  }

  for (const delivery of batch) {
    const fresh = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (!fresh || fresh.status !== "RUNNING") break;
    await sendDelivery(campaign as never, delivery);
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { lastRunAt: new Date() } });

  const open = await prisma.campaignDelivery.count({ where: { campaignId, status: { in: ["queued", "scheduled"] } } });
  if (open > 0) {
    await enqueue("campaign", "dispatch", { campaignId }, { delay: 60_000, attempts: 1 });
  } else {
    await completeCampaign(campaignId);
  }
  return batch.length;
}

// ============================================================
// Read APIs
// ============================================================

export async function getCampaignStats() {
  const [byStatus, totals] = await Promise.all([
    prisma.campaign.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.campaign.aggregate({
      _sum: { totalRecipients: true, sentCount: true, deliveredCount: true, readCount: true, failedCount: true, skippedCount: true },
    }),
  ]);
  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
  return {
    total: byStatus.reduce((a, b) => a + b._count._all, 0),
    draft: statusMap["DRAFT"] ?? 0,
    scheduled: statusMap["SCHEDULED"] ?? 0,
    running: statusMap["RUNNING"] ?? 0,
    paused: statusMap["PAUSED"] ?? 0,
    completed: statusMap["COMPLETED"] ?? 0,
    cancelled: statusMap["CANCELLED"] ?? 0,
    totalRecipients: totals._sum.totalRecipients ?? 0,
    sent: totals._sum.sentCount ?? 0,
    delivered: totals._sum.deliveredCount ?? 0,
    read: totals._sum.readCount ?? 0,
    failed: totals._sum.failedCount ?? 0,
    skipped: totals._sum.skippedCount ?? 0,
  };
}

export async function listCampaigns(opts: {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
} = {}): Promise<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(opts.page ?? 1, 1);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.q) where.name = { contains: opts.q, mode: "insensitive" };

  const [total, items] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        template: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { deliveries: true } },
      },
    }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getCampaign(id: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: { select: { id: true, name: true, body: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { deliveries: true } },
    },
  });
  if (!campaign) throw new Error("Campaign not found");
  return campaign;
}

export async function listCampaignDeliveries(opts: {
  campaignId?: string;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
} = {}): Promise<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(opts.page ?? 1, 1);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 200);

  const where: Record<string, unknown> = {};
  if (opts.campaignId) where.campaignId = opts.campaignId;
  if (opts.status) where.status = opts.status;
  if (opts.q) where.phone = { contains: opts.q };

  const [total, items] = await Promise.all([
    prisma.campaignDelivery.count({ where }),
    prisma.campaignDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, phone: true, name: true, displayName: true } } },
    }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}