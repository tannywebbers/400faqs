import { Router } from "express";
import { z } from "zod";
import { ok, AppError } from "../../lib/response";
import { validate, parsePagination } from "../../middleware/validate";
import { type AdminRequest } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import {
  getRevenueSettings,
  getRevenueStats,
  listLedger,
  addManualLedgerEntry,
  updateLedgerStatus,
  backfillRevenueFromEvents,
  exportLedgerCsv,
  updateRevenueSettings,
} from "../../services/revenue";

export const revenueRouter = Router();

const STATUSES = ["pending", "confirmed", "paid", "rejected"] as const;

// ── Settings ─────────────────────────────────────────────────

revenueRouter.get("/config", async (_req, res) => {
  res.json(ok(await getRevenueSettings()));
});

const configSchema = z.object({
  body: z.object({
    revenuePerVerification: z.number().min(0).max(100000),
    payoutRate: z.number().min(0).max(1),
    currency: z.string().min(3).max(8),
  }),
});

revenueRouter.put("/config", validate(configSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof configSchema>["body"] } }).validated.body;

  await updateRevenueSettings({
    revenuePerVerification: body.revenuePerVerification,
    payoutRate: body.payoutRate,
    currency: body.currency.toUpperCase(),
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "REVENUE_SETTINGS_UPDATED",
      targetType: "revenue",
      details: { ...body, currency: body.currency.toUpperCase() },
    },
  });

  res.json(ok(await getRevenueSettings()));
});

// ── Stats ────────────────────────────────────────────────────

revenueRouter.get("/stats", async (req, res) => {
  const stats = await getRevenueStats({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  });
  res.json(ok(stats));
});

// ── Ledger ───────────────────────────────────────────────────

revenueRouter.get("/", async (req, res) => {
  const { page, limit } = parsePagination(req.query, { maxLimit: 200 });
  const result = await listLedger({
    page,
    limit,
    status: req.query.status as string | undefined,
    type: req.query.type as string | undefined,
    providerId: req.query.providerId as string | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  });
  res.json(ok(result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages }));
});

const manualSchema = z.object({
  body: z.object({
    currency: z.string().min(3).max(8).optional(),
    revenueAmount: z.number().min(-1000000).max(1000000),
    payoutAmount: z.number().min(-1000000).max(1000000).optional(),
    status: z.enum(STATUSES).optional(),
    eventType: z.enum(["VERIFICATION", "CLICK", "IMPRESSION", "PAYOUT", "ADJUSTMENT", "OTHER"]).optional(),
    isEstimated: z.boolean().optional(),
    providerReference: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    providerId: z.string().optional().nullable(),
    sessionId: z.string().optional().nullable(),
    userId: z.string().optional().nullable(),
    recordAt: z.string().max(40).optional(),
  }),
});

revenueRouter.post("/manual", validate(manualSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof manualSchema>["body"] } }).validated.body;

  const entry = await addManualLedgerEntry({ ...body, createdById: admin.id });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "REVENUE_MANUAL_ENTRY",
      targetType: "revenue",
      targetId: entry.id,
      details: { revenueAmount: entry.revenueAmount, currency: entry.currency, notes: entry.notes },
    },
  });

  res.json(ok(entry));
});

const statusSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    status: z.enum(STATUSES).optional(),
    notes: z.string().max(1000).optional(),
  }),
});

revenueRouter.post("/:id/status", validate(statusSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: { status?: Status; notes?: string } } }).validated.body;

  const existing = await prisma.revenueLedger.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Ledger entry not found");

  await updateLedgerStatus(id, body);

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "REVENUE_STATUS_CHANGED",
      targetType: "revenue",
      targetId: id,
      details: { from: existing.status, to: body.status, notes: body.notes },
    },
  });

  res.json(ok(await prisma.revenueLedger.findUnique({ where: { id } })));
});

type Status = (typeof STATUSES)[number];

// ── Backfill auto entries ────────────────────────────────────

revenueRouter.post("/backfill", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const result = await backfillRevenueFromEvents();
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "REVENUE_BACKFILL",
      targetType: "revenue",
      details: result,
    },
  });
  res.json(ok(result));
});

// ── CSV export ───────────────────────────────────────────────

revenueRouter.get("/export", async (req, res) => {
  const csv = await exportLedgerCsv({
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
    status: req.query.status as string | undefined,
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="revenue-ledger.csv"');
  res.send(csv);
});