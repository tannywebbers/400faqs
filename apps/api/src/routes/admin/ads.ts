import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { ok, AppError } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";
import { recordEvent } from "../../services/monetization";
import { getAdapter, listSupportedProviderTypes, AdPlacements, AdEventTypes } from "../../services/adproviders";

// ============================================================
// Admin: provider-agnostic ad / monetization management.
//
// Surface exposes providers, placements, and aggregated
// performance so an admin can route different placements to
// different providers WITHOUT touching application code.
// All provider CRUD writes go to the audit log.
// ============================================================

export const adsAdminRouter = Router();

// Secret keys never returned to the admin/browser (redacted below).
const SECRET_KEYS = new Set([
  "secret",
  "token",
  "callbackSecret",
  "apiKey",
  "apikey",
  "key",
  "password",
  "credentials",
  "signature",
  "auth",
  "clientSecret",
  "apiToken",
]);

function redactConfig(record: {
  configuration: unknown;
}): Record<string, unknown> {
  const cfg = record.configuration;
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k.toLowerCase())) {
      out[k] = typeof v === "string" && v ? "••••••••" : "••••••";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function redactProvider<T extends { configuration: unknown }>(p: T): T & { configuration: Record<string, unknown> } {
  return { ...p, configuration: redactConfig(p) };
}

// ── Supported capability metadata ─────────────────────────

adsAdminRouter.get("/types", async (_req, res) => {
  res.json(ok({ providerTypes: listSupportedProviderTypes(), placements: AdPlacements, eventTypes: AdEventTypes }));
});

// ── Providers ─────────────────────────────────────────────

const providerSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    type: z.string().min(1).max(50),
    description: z.string().max(1000).optional().default(""),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(0).max(100000).default(100),
    configuration: z.record(z.string(), z.unknown()).optional(),
    revenueModel: z.enum(["CPM", "CPC", "CPA", "FIXED"]).optional().default("CPA"),
    currency: z.string().max(8).optional().default("USD"),
    cpmRate: z.number().min(0).max(1000000).optional().default(0),
    cpcRate: z.number().min(0).max(1000000).optional().default(0),
    cpaRate: z.number().min(0).max(1000000).optional().default(0),
    fixedPayoutPerVerification: z.number().min(0).max(1000000).optional().default(0),
  }),
});

adsAdminRouter.get("/providers", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const includeArchived = req.query.includeArchived === "true";

  const where: Record<string, unknown> = {};
  if (!includeArchived) where.archived = false;
  if (q) where.name = { contains: q, mode: "insensitive" };

  const [total, items] = await Promise.all([
    prisma.adProvider.count({ where }),
    prisma.adProvider.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: { _count: { select: { placementAssignments: true } } },
    }),
  ]);

  res.json(
    ok(items.map(redactProvider), {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  );
});

adsAdminRouter.post("/providers", validate(providerSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof providerSchema.shape.body> } }).validated.body;

  const provider = await prisma.adProvider.create({
    data: {
      name: body.name,
      type: body.type,
      description: body.description || null,
      enabled: body.enabled,
      priority: body.priority,
      configuration: (body.configuration ?? undefined) as Prisma.InputJsonValue | undefined,
      revenueModel: body.revenueModel ?? "CPA",
      currency: body.currency ?? "USD",
      cpmRate: body.cpmRate ?? 0,
      cpcRate: body.cpcRate ?? 0,
      cpaRate: body.cpaRate ?? 0,
      fixedPayoutPerVerification: body.fixedPayoutPerVerification ?? 0,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "AD_PROVIDER_CREATED",
      targetType: "ad_provider",
      targetId: provider.id,
      details: { name: provider.name },
    },
  });
  await recordEvent("AD_PROVIDER_CREATED", { metadata: { name: provider.name } });

  res.json(ok(redactProvider(provider)));
});

const providerUpdateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    type: z.string().min(1).max(50).optional(),
    description: z.string().max(1000).optional().nullable(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(100000).optional(),
    configuration: z.record(z.string(), z.unknown()).optional(),
    revenueModel: z.enum(["CPM", "CPC", "CPA", "FIXED"]).optional(),
    currency: z.string().max(8).optional(),
    cpmRate: z.number().min(0).max(1000000).optional(),
    cpcRate: z.number().min(0).max(1000000).optional(),
    cpaRate: z.number().min(0).max(1000000).optional(),
    fixedPayoutPerVerification: z.number().min(0).max(1000000).optional(),
  }),
});

adsAdminRouter.put("/providers/:id", validate(providerUpdateSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: Record<string, unknown> } }).validated.body;

  const existing = await prisma.adProvider.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Provider not found");

  const data: Record<string, unknown> = { ...body };
  const updated = await prisma.adProvider.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "AD_PROVIDER_UPDATED",
      targetType: "ad_provider",
      targetId: id,
      details: { name: updated.name },
    },
  });
  await recordEvent("AD_PROVIDER_UPDATED", { metadata: { name: updated.name } });

  res.json(ok(redactProvider(updated)));
});

const providerStatusSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({ enabled: z.boolean().optional(), archived: z.boolean().optional() }),
});

adsAdminRouter.patch("/providers/:id/status", validate(providerStatusSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: { enabled?: boolean; archived?: boolean } } }).validated.body;

  const existing = await prisma.adProvider.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Provider not found");

  const data: { enabled?: boolean; archived?: boolean } = {};
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.archived !== undefined) data.archived = body.archived;

  const updated = await prisma.adProvider.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: body.archived ? "AD_PROVIDER_ARCHIVED" : body.enabled ? "AD_PROVIDER_ENABLED" : "AD_PROVIDER_DISABLED",
      targetType: "ad_provider",
      targetId: id,
      details: { name: existing.name },
    },
  });
  await recordEvent("AD_PROVIDER_STATUS_CHANGED", { metadata: { name: existing.name, ...data } });

  res.json(ok(redactProvider(updated)));
});

adsAdminRouter.get("/providers/:id/stats", async (req, res) => {
  const { id } = req.params;
  const provider = await prisma.adProvider.findUnique({ where: { id } });
  if (!provider) throw new AppError(404, "Provider not found");

  const [impressions, clicks, conversions, verifications, ledger, gates] = await Promise.all([
    prisma.monetizationEvent.count({ where: { providerId: id, type: "IMPRESSION" } }),
    prisma.monetizationEvent.count({ where: { providerId: id, type: "CLICK" } }),
    prisma.monetizationEvent.count({ where: { providerId: id, type: "CONVERSION" } }),
    prisma.monetizationEvent.count({ where: { providerId: id, type: "VERIFICATION" } }),
    prisma.revenueLedger.findMany({ where: { providerId: id }, select: { status: true, isEstimated: true, revenueAmount: true, payoutAmount: true, eventType: true } }),
    prisma.monetizationGate.count({ where: { providerId: id, status: "VERIFIED" } }),
  ]);

  const sum = (rows: { revenueAmount: number }[]) => rows.reduce((a, r) => a + r.revenueAmount, 0);
  const estimated = ledger.filter((r) => r.isEstimated);
  const confirmed = ledger.filter((r) => !r.isEstimated && r.status !== "rejected");
  const paid = ledger.filter((r) => r.status === "paid");

  res.json(
    ok({
      providerId: id,
      name: provider.name,
      type: provider.type,
      impressions,
      clicks,
      conversions,
      verifications,
      verifiedGates: gates,
      ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0,
      conversionRate: clicks ? Math.round((conversions / clicks) * 1000) / 10 : 0,
      revenue: {
        estimated: Math.round(sum(estimated) * 100) / 100,
        confirmed: Math.round(sum(confirmed) * 100) / 100,
        paid: Math.round(sum(paid) * 100) / 100,
      },
      byEventType: [...new Set(ledger.map((r) => r.eventType))].map((t) => ({
        eventType: t,
        rows: ledger.filter((r) => r.eventType === t).length,
        amount: Math.round(sum(ledger.filter((r) => r.eventType === t)) * 100) / 100,
      })),
    })
  );
});

adsAdminRouter.get("/providers/:id/test-config", async (req, res) => {
  const { id } = req.params;
  const provider = await prisma.adProvider.findUnique({ where: { id } });
  if (!provider) throw new AppError(404, "Provider not found");
  const adapter = getAdapter(provider.type);
  const check = adapter.validateConfig({
    id: provider.id,
    name: provider.name,
    type: provider.type,
    description: provider.description,
    enabled: provider.enabled,
    archived: provider.archived,
    priority: provider.priority,
    configuration: provider.configuration,
    placements: provider.placements,
  });
  res.json(ok({ callbackSupported: false, ...check }));
});

adsAdminRouter.delete("/providers/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = req.params;
  const provider = await prisma.adProvider.findUnique({ where: { id } });
  if (!provider) throw new AppError(404, "Provider not found");

  const [ledgerCount, gateCount, eventCount, placementCount] = await Promise.all([
    prisma.revenueLedger.count({ where: { providerId: id } }),
    prisma.monetizationGate.count({ where: { providerId: id } }),
    prisma.monetizationEvent.count({ where: { providerId: id } }),
    prisma.adPlacement.count({ where: { providerId: id } }),
  ]);

  if (ledgerCount > 0 || gateCount > 0 || eventCount > 0 || placementCount > 0) {
    await prisma.adProvider.update({ where: { id }, data: { archived: true } });
    await prisma.auditLog.create({
      data: { adminId: admin.id, action: "AD_PROVIDER_ARCHIVED", targetType: "ad_provider", targetId: id, details: { name: provider.name, reason: "delete_requested_has_history" } },
    });
    return res.json(ok({ archived: true, reason: "provider has history; archived instead of deleted" }));
  }

  await prisma.adProvider.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "AD_PROVIDER_DELETED", targetType: "ad_provider", targetId: id, details: { name: provider.name } },
  });
  await recordEvent("AD_PROVIDER_DELETED", { metadata: { name: provider.name } });
  res.json(ok({ deleted: true }));
});

// ── Placements ────────────────────────────────────────────

const placementSchema = z.object({
  body: z.object({
    key: z.string().min(1).max(64),
    name: z.string().max(120).optional().default(""),
    description: z.string().max(400).optional().default(""),
    providerId: z.string().optional().nullable(),
    providerPlacementId: z.string().max(2000).optional().default(""),
    format: z.string().max(50).optional().nullable(),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(0).max(100000).default(100),
  }),
});

adsAdminRouter.get("/placements", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();

  const where: Record<string, unknown> = {};
  if (q) where.key = { contains: q, mode: "insensitive" };

  const [total, items] = await Promise.all([
    prisma.adPlacement.count({ where }),
    prisma.adPlacement.findMany({
      where,
      include: { provider: { select: { id: true, name: true, type: true, enabled: true, archived: true } } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
  ]);

  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

adsAdminRouter.post("/placements", validate(placementSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof placementSchema.shape.body> } }).validated.body;

  const existing = await prisma.adPlacement.findUnique({ where: { key: body.key } });
  if (existing) throw new AppError(409, "Placement key already exists");

  const placement = await prisma.adPlacement.create({
    data: {
      key: body.key,
      name: body.name || null,
      description: body.description || null,
      providerId: body.providerId ?? null,
      providerPlacementId: body.providerPlacementId || null,
      format: body.format || null,
      enabled: body.enabled,
      priority: body.priority,
    },
    include: { provider: { select: { id: true, name: true, type: true, enabled: true, archived: true } } },
  });

  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "AD_PLACEMENT_CREATED", targetType: "ad_placement", targetId: placement.id, details: { key: placement.key } },
  });
  await recordEvent("AD_PLACEMENT_CREATED", { metadata: { key: placement.key } });

  res.json(ok(placement));
});

const placementUpdateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    key: z.string().min(1).max(64).optional(),
    name: z.string().max(120).optional().nullable(),
    description: z.string().max(400).optional().nullable(),
    providerId: z.string().optional().nullable(),
    providerPlacementId: z.string().max(2000).optional().nullable(),
    format: z.string().max(50).optional().nullable(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(100000).optional(),
  }),
});

adsAdminRouter.put("/placements/:id", validate(placementUpdateSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: Record<string, unknown> } }).validated.body;

  const existing = await prisma.adPlacement.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Placement not found");
  if (body.key !== undefined && body.key !== existing.key) {
    const clash = await prisma.adPlacement.findUnique({ where: { key: String(body.key) } });
    if (clash) throw new AppError(409, "Placement key already exists");
  }

  const data: Record<string, unknown> = { ...body };
  const updated = await prisma.adPlacement.update({
    where: { id },
    data,
    include: { provider: { select: { id: true, name: true, type: true, enabled: true, archived: true } } },
  });

  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "AD_PLACEMENT_UPDATED", targetType: "ad_placement", targetId: id, details: { key: updated.key } },
  });
  await recordEvent("AD_PLACEMENT_UPDATED", { metadata: { key: updated.key } });

  res.json(ok(updated));
});

adsAdminRouter.delete("/placements/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = req.params;
  const existing = await prisma.adPlacement.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Placement not found");

  const eventCount = await prisma.monetizationEvent.count({ where: { placement: existing.key } });
  if (eventCount > 0) {
    // Keep attribution history: disable instead of hard-deleting.
    const updated = await prisma.adPlacement.update({ where: { id }, data: { enabled: false, providerId: null } });
    await prisma.auditLog.create({
      data: { adminId: admin.id, action: "AD_PLACEMENT_DISABLED", targetType: "ad_placement", targetId: id, details: { key: updated.key, reason: "delete_requested_has_history" } },
    });
    return res.json(ok({ disabled: true, reason: "placement has event history; disabled instead of deleted" }));
  }

  await prisma.adPlacement.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "AD_PLACEMENT_DELETED", targetType: "ad_placement", targetId: id, details: { key: existing.key } },
  });
  res.json(ok({ deleted: true }));
});

// ── Performance (placements × providers) ──────────────────

adsAdminRouter.get("/performance", async (req, res) => {
  const placements = await prisma.adPlacement.findMany({
    include: { provider: { select: { id: true, name: true, type: true } } },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  const perPlacement = await Promise.all(
    placements.map(async (p) => {
      const events = await prisma.monetizationEvent.groupBy({
        by: ["placement", "type"],
        where: { placement: p.key },
        _count: { _all: true },
      });
      const counts: Record<string, number> = {};
      for (const e of events) counts[e.type] = e._count._all;

      const ledger = await prisma.revenueLedger.findMany({
        where: { providerId: p.providerId ?? undefined },
        select: { isEstimated: true, status: true, revenueAmount: true },
      });
      const sum = (rows: { revenueAmount: number }[]) => rows.reduce((a, r) => a + r.revenueAmount, 0);
      const estimated = ledger.filter((r) => r.isEstimated);
      const confirmed = ledger.filter((r) => !r.isEstimated && r.status !== "rejected");

      return {
        placement: p.key,
        name: p.name,
        enabled: p.enabled,
        provider: p.provider
          ? { id: p.provider.id, name: p.provider.name, type: p.provider.type }
          : null,
        impressions: counts.IMPRESSION ?? 0,
        clicks: counts.CLICK ?? 0,
        conversions: counts.CONVERSION ?? 0,
        verifications: counts.VERIFICATION ?? 0,
        revenue: {
          estimated: Math.round(sum(estimated) * 100) / 100,
          confirmed: Math.round(sum(confirmed) * 100) / 100,
        },
      };
    })
  );

  // Provider rollups for the per-provider block.
  const providers = await prisma.adProvider.findMany({ where: { archived: false }, select: { id: true, name: true, type: true, enabled: true } });
  const perProvider = await Promise.all(
    providers.map(async (pv) => {
      const [impressions, clicks, conversions, verifications, ledger] = await Promise.all([
        prisma.monetizationEvent.count({ where: { providerId: pv.id, type: "IMPRESSION" } }),
        prisma.monetizationEvent.count({ where: { providerId: pv.id, type: "CLICK" } }),
        prisma.monetizationEvent.count({ where: { providerId: pv.id, type: "CONVERSION" } }),
        prisma.monetizationEvent.count({ where: { providerId: pv.id, type: "VERIFICATION" } }),
        prisma.revenueLedger.findMany({ where: { providerId: pv.id }, select: { isEstimated: true, status: true, revenueAmount: true } }),
      ]);
      const sum = (rows: { revenueAmount: number }[]) => rows.reduce((a, r) => a + r.revenueAmount, 0);
      const estimated = ledger.filter((r) => r.isEstimated);
      const confirmed = ledger.filter((r) => !r.isEstimated && r.status !== "rejected");
      return {
        providerId: pv.id,
        name: pv.name,
        type: pv.type,
        enabled: pv.enabled,
        impressions,
        clicks,
        conversions,
        verifications,
        ctr: impressions ? Math.round((clicks / impressions) * 1000) / 10 : 0,
        revenue: {
          estimated: Math.round(sum(estimated) * 100) / 100,
          confirmed: Math.round(sum(confirmed) * 100) / 100,
        },
      };
    })
  );

  const placementTotals = perPlacement.reduce(
    (acc, p) => {
      acc.impressions += p.impressions;
      acc.clicks += p.clicks;
      acc.conversions += p.conversions;
      acc.verifications += p.verifications;
      acc.estimated += p.revenue.estimated;
      acc.confirmed += p.revenue.confirmed;
      return acc;
    },
    { impressions: 0, clicks: 0, conversions: 0, verifications: 0, estimated: 0, confirmed: 0 }
  );

  res.json(ok({ summary: placementTotals, placements: perPlacement, providers: perProvider }));
});
