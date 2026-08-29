import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { getAllSettings, settingsToRecord, settingNumber } from "./settings";
import type { Prisma, RevenueEventType } from "@prisma/client";

// ============================================================
// Revenue / monetization ledger.
//
// Converts monetization activity into financial records:
//   - AUTO rows are created when a gate is successfully verified
//     (revenue per verification x payout share to the provider).
//   - MANUAL rows are recorded by admins (adjustments, refunds,
//     ad-hoc credits / debits).
// Each row tracks revenue vs payout expectation and a lifecycle
// of pending -> confirmed -> paid.
// ============================================================

export type RevenueSettings = {
  revenuePerVerification: number;
  payoutRate: number;
  currency: string;
};

function clampNum(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getRevenueSettings(): Promise<RevenueSettings> {
  try {
    const rows = await getAllSettings();
    const s = settingsToRecord(rows);
    return {
      revenuePerVerification: clampNum(settingNumber(s, "monetization.revenuePerVerification", 0.25), 0, 10000),
      payoutRate: clampNum(settingNumber(s, "monetization.payoutRate", 0.5), 0, 1),
      currency: (s["monetization.currency"] || "USD").slice(0, 8).toUpperCase(),
    };
  } catch (err) {
    logger.warn("[revenue] settings read failed, using defaults", (err as Error).message);
    return { revenuePerVerification: 0.25, payoutRate: 0.5, currency: "USD" };
  }
}

export async function updateRevenueSettings(input: { revenuePerVerification: number; payoutRate: number; currency: string }) {
  const entries = [
    { key: "monetization.revenuePerVerification", value: String(clampNum(input.revenuePerVerification, 0, 10000)) },
    { key: "monetization.payoutRate", value: String(clampNum(input.payoutRate, 0, 1)) },
    { key: "monetization.currency", value: input.currency.slice(0, 8).toUpperCase() },
  ];
  for (const e of entries) {
    await prisma.setting.upsert({
      where: { key: e.key },
      update: { value: e.value },
      create: { key: e.key, value: e.value, group: "monetization" },
    });
  }
  return getRevenueSettings();
}

/**
 * Record the automatic revenue row produced by a completed verification.
 * Idempotent per gate: one AUTO row per gate.
 */
export async function recordVerifiedRevenue(gate: {
  id: string;
  sessionId: string;
  userId: string;
  providerId: string | null;
}): Promise<void> {
  try {
    const existing = await prisma.revenueLedger.findFirst({ where: { gateId: gate.id, type: "AUTO" } });
    if (existing) return;

    const settings = await getRevenueSettings();
    const amount = round2(settings.revenuePerVerification);
    const payout = round2(amount * settings.payoutRate);

    await prisma.revenueLedger.create({
      data: {
        type: "AUTO",
        eventType: "VERIFICATION",
        gateId: gate.id,
        sessionId: gate.sessionId,
        userId: gate.userId,
        providerId: gate.providerId ?? null,
        currency: settings.currency,
        revenueAmount: amount,
        payoutAmount: payout,
        revenueShare: round2(settings.payoutRate),
        status: "pending",
        isEstimated: true,
        notes: "Auto-recorded on completed verification",
      },
    });
  } catch (err) {
    logger.warn("[revenue] ledger record failed", (err as Error).message);
  }
}

/** Backfill ledger rows from historical VERIFICATION_SUCCESS events (e.g. after enabling the ledger). */
export async function backfillRevenueFromEvents(): Promise<{ processed: number; created: number }> {
  const events = await prisma.monetizationEvent.findMany({
    where: { type: "VERIFICATION_SUCCESS", gateId: { not: null } },
    select: { gateId: true },
  });

  let created = 0;
  for (const e of events) {
    if (!e.gateId) continue;
    const gate = await prisma.monetizationGate.findUnique({
      where: { id: e.gateId },
      select: { id: true, sessionId: true, userId: true, providerId: true },
    });
    if (!gate) continue;
    const existing = await prisma.revenueLedger.findFirst({ where: { gateId: gate.id, type: "AUTO" } });
    if (existing) continue;
    const settings = await getRevenueSettings();
    const amount = round2(settings.revenuePerVerification);
    await prisma.revenueLedger.create({
      data: {
        type: "AUTO",
        eventType: "VERIFICATION",
        gateId: gate.id,
        sessionId: gate.sessionId,
        userId: gate.userId,
        providerId: gate.providerId ?? null,
        currency: settings.currency,
        revenueAmount: amount,
        payoutAmount: round2(amount * settings.payoutRate),
        revenueShare: round2(settings.payoutRate),
        status: "pending",
        isEstimated: true,
        notes: "Backfilled from verification history",
      },
    });
    created++;
  }
  return { processed: events.length, created };
}

/**
 * Record ESTIMATED provider channel revenue for a provider event
 * (impression / click) based on the provider's revenue model:
 *   CPM    -> events/1000 * cpmRate
 *   CPC    -> cpmRate (per click)
 *   CPA    -> cpaRate * conversionRateFactor (0 = skip until verified)
 *   FIXED  -> fixedPayoutPerVerification (only used on verification)
 * Keep estimation separate from confirmed revenue: rows are always
 * created as isEstimated=true and are elevated only when an official
 * provider callback or a verification confirms them.
 */
export async function recordProviderChannelRevenue(providerId: string, eventType: "IMPRESSION" | "CLICK", reference: string): Promise<void> {
  if (!reference) return;
  try {
    const provider = await prisma.adProvider.findFirst({
      where: { id: providerId },
      select: { id: true, name: true, revenueModel: true, currency: true, cpmRate: true, cpcRate: true, cpaRate: true, fixedPayoutPerVerification: true },
    });
    if (!provider || provider.revenueModel === null) return;

    const existing = await prisma.revenueLedger.findFirst({
      where: { providerId: provider.id, eventType, notes: reference },
    });
    if (existing) return;

    const settings = await getRevenueSettings();
    const currency = provider.currency || settings.currency;
    let amount = 0;
    if (eventType === "IMPRESSION" && provider.revenueModel === "CPM") {
      amount = (provider.cpmRate || 0) / 1000;
    } else if (eventType === "CLICK" && provider.revenueModel === "CPC") {
      amount = provider.cpcRate || 0;
    } else {
      return; // CPA / FIXED rely on verification / conversion callbacks instead.
    }
    if (amount <= 0) return;

    await prisma.revenueLedger.create({
      data: {
        type: "AUTO",
        eventType,
        providerId: provider.id,
        currency,
        revenueAmount: round2(amount),
        payoutAmount: 0,
        revenueShare: 0,
        status: "pending",
        isEstimated: true,
        notes: reference,
      },
    });
  } catch (err) {
    logger.warn("[revenue] provider channel revenue record failed", (err as Error).message);
  }
}

export type LedgerStats = {
  rows: number;
  revenueTotal: number;
  payoutTotal: number;
  estimatedRevenue: number;
  confirmedRevenue: number;
  pendingRows: number;
  pendingRevenue: number;
  confirmedRows: number;
  confirmedRevenueRows: number;
  paidRows: number;
  paidRevenue: number;
  adjustments: number;
  adjustmentAmount: number;
  autoRows: number;
  manualRows: number;
  byEventType: { eventType: string; rows: number; amount: number }[];
  currency: string;
  averageRevenue: number;
};

export async function getRevenueStats(opts: { from?: string; to?: string } = {}): Promise<LedgerStats> {
  const where: Prisma.RevenueLedgerWhereInput = {};
  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) where.createdAt.gte = new Date(opts.from);
    if (opts.to) {
      const to = new Date(opts.to);
      to.setDate(to.getDate() + 1);
      where.createdAt.lte = to;
    }
  }

  const rows = await prisma.revenueLedger.findMany({ where });
  const settings = await getRevenueSettings();

  const sum = (rows: { revenueAmount: number }[]) => rows.reduce((acc, r) => acc + r.revenueAmount, 0);
  const pending = rows.filter((r) => r.status === "pending");
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const paid = rows.filter((r) => r.status === "paid");
  const estimated = rows.filter((r) => r.isEstimated);
  const confirmedRev = rows.filter((r) => !r.isEstimated && r.status !== "rejected");
  const adjustments = rows.filter((r) => r.eventType === "ADJUSTMENT" || (r.type === "MANUAL" && r.revenueAmount < 0) || r.status === "rejected");
  const eventTypeMap = new Map<string, { eventType: string; rows: number; amount: number }>();
  for (const r of rows) {
    const cur = eventTypeMap.get(r.eventType) ?? { eventType: r.eventType, rows: 0, amount: 0 };
    cur.rows += 1;
    cur.amount += r.revenueAmount;
    eventTypeMap.set(r.eventType, cur);
  }

  return {
    rows: rows.length,
    revenueTotal: round2(sum(rows)),
    payoutTotal: round2(rows.reduce((acc, r) => acc + r.payoutAmount, 0)),
    estimatedRevenue: round2(sum(estimated)),
    confirmedRevenue: round2(sum(confirmedRev)),
    pendingRows: pending.length,
    pendingRevenue: round2(sum(pending)),
    confirmedRows: confirmed.length,
    confirmedRevenueRows: confirmed.length + paid.length,
    paidRows: paid.length,
    paidRevenue: round2(sum(paid)),
    adjustments: adjustments.length,
    adjustmentAmount: round2(sum(adjustments)),
    autoRows: rows.filter((r) => r.type === "AUTO").length,
    manualRows: rows.filter((r) => r.type === "MANUAL").length,
    byEventType: [...eventTypeMap.values()].sort((a, b) => b.amount - a.amount),
    currency: settings.currency,
    averageRevenue: rows.length ? round2(sum(rows) / rows.length) : 0,
  };
}

export async function listLedger(opts: {
  page?: number;
  limit?: number;
  status?: string;
  from?: string;
  to?: string;
  providerId?: string;
  type?: string;
} = {}): Promise<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(opts.page ?? 1, 1);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  const where: Prisma.RevenueLedgerWhereInput = {};
  if (opts.status) where.status = opts.status;
  if (opts.type) where.type = opts.type;
  if (opts.providerId) where.providerId = opts.providerId;
  if (opts.from || opts.to) {
    where.createdAt = {};
    if (opts.from) where.createdAt.gte = new Date(opts.from);
    if (opts.to) {
      const to = new Date(opts.to);
      to.setDate(to.getDate() + 1);
      where.createdAt.lte = to;
    }
  }

  const [total, items] = await Promise.all([
    prisma.revenueLedger.count({ where }),
    prisma.revenueLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        provider: { select: { id: true, name: true } },
        session: { select: { id: true, inviteCode: true, status: true, category: { select: { name: true } } } },
        user: { select: { id: true, phone: true, name: true, displayName: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export type ManualLedgerInput = {
  currency?: string;
  revenueAmount: number;
  payoutAmount?: number;
  status?: string;
  eventType?: string;
  isEstimated?: boolean;
  providerReference?: string;
  notes?: string;
  providerId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  createdById?: string | null;
  recordAt?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function addManualLedgerEntry(input: ManualLedgerInput) {
  const settings = await getRevenueSettings();
  const eventType = (input.eventType ?? "VERIFICATION").toUpperCase() as RevenueEventType;
  const status = input.status ?? "confirmed";
  const isEstimated = input.isEstimated ?? (status !== "confirmed" && status !== "paid");
  return prisma.revenueLedger.create({
    data: {
      type: "MANUAL",
      eventType,
      currency: input.currency && input.currency.length <= 8 ? input.currency.toUpperCase() : settings.currency,
      revenueAmount: input.revenueAmount,
      payoutAmount: input.payoutAmount ?? 0,
      revenueShare: input.revenueAmount ? round2((input.payoutAmount ?? 0) / input.revenueAmount) : 0,
      status,
      isEstimated,
      confirmedAt: status === "confirmed" || status === "paid" ? new Date() : null,
      providerReference: input.providerReference ?? null,
      notes: input.notes ?? "Manual adjustment",
      providerId: input.providerId ?? null,
      sessionId: input.sessionId ?? null,
      userId: input.userId ?? null,
      createdById: input.createdById ?? null,
      recordedAt: input.recordAt ? new Date(input.recordAt) : new Date(),
      metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
    },
  });
}

export async function updateLedgerStatus(id: string, data: { status?: string; notes?: string }): Promise<void> {
  const patch: Prisma.RevenueLedgerUpdateInput = {};
  if (data.status) {
    patch.status = data.status;
    patch.isEstimated = data.status !== "confirmed" && data.status !== "paid";
    if (data.status === "confirmed" || data.status === "paid") patch.confirmedAt = new Date();
  }
  if (data.notes !== undefined) patch.notes = data.notes;
  await prisma.revenueLedger.update({ where: { id }, data: patch });
}

const LEDGER_CSV_HEADERS = ["ID", "Type", "Status", "Currency", "Revenue", "Payout", "Provider", "Session", "User Phone", "Reference", "Notes", "Created At"];

export async function exportLedgerCsv(opts: { from?: string; to?: string; status?: string } = {}): Promise<string> {
  const { items } = await listLedger({ page: 1, limit: 5000, from: opts.from, to: opts.to, status: opts.status });
  const lines = [LEDGER_CSV_HEADERS.join(",")];
  for (const raw of items) {
    const r = raw as {
      id: string;
      type: string;
      status: string;
      currency: string;
      revenueAmount: number;
      payoutAmount: number;
      providerReference: string | null;
      notes: string | null;
      createdAt: Date;
      provider?: { name: string } | null;
      session?: { inviteCode: string } | null;
      user?: { phone: string; displayName: string | null } | null;
    };
    lines.push(
      [
        r.id,
        r.type,
        r.status,
        r.currency,
        r.revenueAmount,
        r.payoutAmount,
        r.provider?.name ?? "",
        r.session?.inviteCode ?? "",
        r.user?.phone ?? "",
        r.providerReference ?? "",
        (r.notes ?? "").replace(/,/g, " "),
        r.createdAt.toISOString(),
      ].join(",")
    );
  }
  return lines.join("\n");
}