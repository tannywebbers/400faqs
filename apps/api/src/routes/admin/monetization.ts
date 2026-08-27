import { Router } from "express";
import { z } from "zod";
import { GateStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { ok, AppError } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";
import { getMonetizationSettings, getMonetizationStats, recordEvent } from "../../services/monetization";

export const monetizationAdminRouter = Router();

// ── Config ──────────────────────────────────────────────────

const SETTING_GROUPS: { key: string; type: "text" | "number"; min?: number; max?: number }[] = [
  { key: "monetization.enabled", type: "text" },
  { key: "monetization.roundInterval", type: "number", min: 1, max: 10000 },
  { key: "monetization.countdownSeconds", type: "number", min: 0, max: 3600 },
  { key: "monetization.codeExpiryMinutes", type: "number", min: 1, max: 1440 },
  { key: "monetization.linkExpiryMinutes", type: "number", min: 1, max: 10080 },
  { key: "monetization.maxAttempts", type: "number", min: 1, max: 50 },
  { key: "monetization.codeLength", type: "number", min: 4, max: 10 },
  { key: "monetization.codeType", type: "text" },
  { key: "monetization.rotation", type: "text" },
  { key: "monetization.defaultProviderId", type: "text" },
  { key: "monetization.defaultSnippetId", type: "text" },
  { key: "monetization.directLink", type: "text" },
  { key: "monetization.directLinkEnabled", type: "text" },
];

const configSchema = z.object({
  body: z.object({
    enabled: z.boolean(),
    roundInterval: z.number().int().min(1).max(10000),
    countdownSeconds: z.number().int().min(0).max(3600),
    codeExpiryMinutes: z.number().int().min(1).max(1440),
    linkExpiryMinutes: z.number().int().min(1).max(10080),
    maxAttempts: z.number().int().min(1).max(50),
    codeLength: z.number().int().min(4).max(10),
    codeType: z.enum(["numeric", "alphanumeric"]),
    rotation: z.enum(["priority", "random"]),
    defaultProviderId: z.string().max(100),
    defaultSnippetId: z.string().max(100),
    directLink: z.string().max(2000),
    directLinkEnabled: z.boolean(),
  }),
});

monetizationAdminRouter.get("/config", async (_req, res) => {
  const settings = await getMonetizationSettings();
  res.json(ok(settings));
});

monetizationAdminRouter.put("/config", validate(configSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof configSchema>["body"] } }).validated.body;

  const entries: { key: string; value: string }[] = [
    { key: "monetization.enabled", value: String(body.enabled) },
    { key: "monetization.roundInterval", value: String(body.roundInterval) },
    { key: "monetization.countdownSeconds", value: String(body.countdownSeconds) },
    { key: "monetization.codeExpiryMinutes", value: String(body.codeExpiryMinutes) },
    { key: "monetization.linkExpiryMinutes", value: String(body.linkExpiryMinutes) },
    { key: "monetization.maxAttempts", value: String(body.maxAttempts) },
    { key: "monetization.codeLength", value: String(body.codeLength) },
    { key: "monetization.codeType", value: body.codeType },
    { key: "monetization.rotation", value: body.rotation },
    { key: "monetization.defaultProviderId", value: body.defaultProviderId },
    { key: "monetization.defaultSnippetId", value: body.defaultSnippetId },
    { key: "monetization.directLink", value: body.directLink },
    { key: "monetization.directLinkEnabled", value: String(body.directLinkEnabled) },
  ];

  for (const e of entries) {
    await prisma.setting.upsert({
      where: { key: e.key },
      update: { value: e.value },
      create: { key: e.key, value: e.value, group: "monetization" },
    });
  }

  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "MONETIZATION_SETTINGS_UPDATED", targetType: "monetization", details: { keys: entries.map((e) => e.key) } },
  });

  res.json(ok(await getMonetizationSettings()));
});

// ── Stats / Analytics foundation ────────────────────────────

monetizationAdminRouter.get("/stats", async (_req, res) => {
  res.json(ok(await getMonetizationStats()));
});

// ── Ad Providers ────────────────────────────────────────────

const providerSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    type: z.string().min(1).max(50),
    description: z.string().max(1000).optional().default(""),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(0).max(100000).default(100),
    configuration: z.record(z.string(), z.unknown()).optional(),
  }),
});

monetizationAdminRouter.get("/providers", async (req, res) => {
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
      include: { _count: { select: { snippets: true, gates: true } } },
    }),
  ]);

  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

monetizationAdminRouter.post("/providers", validate(providerSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof providerSchema>["body"] } }).validated.body;

  const provider = await prisma.adProvider.create({
    data: {
      name: body.name,
      type: body.type,
      description: body.description || null,
      enabled: body.enabled,
      priority: body.priority,
      configuration: (body.configuration ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "AD_PROVIDER_CREATED", targetType: "ad_provider", targetId: provider.id, details: { name: provider.name } },
  });
  await recordEvent("AD_PROVIDER_CREATED", { metadata: { name: provider.name } });

  res.json(ok(provider));
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
  }),
});

monetizationAdminRouter.put("/providers/:id", validate(providerUpdateSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: Record<string, unknown> } }).validated.body;

  const existing = await prisma.adProvider.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Provider not found");

  const updated = await prisma.adProvider.update({ where: { id }, data: body });
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "AD_PROVIDER_UPDATED", targetType: "ad_provider", targetId: id, details: { name: updated.name } },
  });
  await recordEvent("AD_PROVIDER_UPDATED", { metadata: { name: updated.name } });

  res.json(ok(updated));
});

const providerStatusSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    enabled: z.boolean().optional(),
    archived: z.boolean().optional(),
  }),
});

monetizationAdminRouter.patch("/providers/:id/status", validate(providerStatusSchema), async (req, res) => {
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

  res.json(ok(updated));
});

// ── Ad Snippets ─────────────────────────────────────────────

const snippetSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(120),
    providerId: z.string().optional().nullable(),
    type: z.string().min(1).max(50),
    content: z.string().max(20000).optional().default(""),
    directLink: z.string().max(2000).optional().default(""),
    placement: z.string().min(1).max(50),
    enabled: z.boolean().default(true),
    priority: z.number().int().min(0).max(100000).default(100),
  }),
});

monetizationAdminRouter.get("/snippets", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const providerId = req.query.providerId as string | undefined;
  const type = req.query.type as string | undefined;
  const enabled = req.query.enabled as string | undefined;
  const includeArchived = req.query.includeArchived === "true";

  const where: Record<string, unknown> = {};
  if (!includeArchived) where.archived = false;
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (providerId) where.providerId = providerId;
  if (type) where.type = type;
  if (enabled !== undefined && enabled !== "") where.enabled = enabled === "true";

  const [total, items] = await Promise.all([
    prisma.adSnippet.count({ where }),
    prisma.adSnippet.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: { provider: { select: { id: true, name: true } } },
    }),
  ]);

  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

monetizationAdminRouter.post("/snippets", validate(snippetSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof snippetSchema>["body"] } }).validated.body;

  const snippet = await prisma.adSnippet.create({
    data: {
      name: body.name,
      providerId: body.providerId ?? null,
      type: body.type,
      content: body.content || null,
      directLink: body.directLink || null,
      placement: body.placement,
      enabled: body.enabled,
      priority: body.priority,
    },
  });

  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "AD_SNIPPET_CREATED", targetType: "ad_snippet", targetId: snippet.id, details: { name: snippet.name } },
  });
  await recordEvent("AD_SNIPPET_CREATED", { metadata: { name: snippet.name } });

  res.json(ok(snippet));
});

const snippetUpdateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    providerId: z.string().optional().nullable(),
    type: z.string().min(1).max(50).optional(),
    content: z.string().max(20000).optional(),
    directLink: z.string().max(2000).optional(),
    placement: z.string().min(1).max(50).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(100000).optional(),
  }),
});

monetizationAdminRouter.put("/snippets/:id", validate(snippetUpdateSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: Record<string, unknown> } }).validated.body;

  const existing = await prisma.adSnippet.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Snippet not found");

  const updated = await prisma.adSnippet.update({ where: { id }, data: body });
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "AD_SNIPPET_UPDATED", targetType: "ad_snippet", targetId: id, details: { name: updated.name } },
  });
  await recordEvent("AD_SNIPPET_UPDATED", { metadata: { name: updated.name } });

  res.json(ok(updated));
});

const snippetStatusSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    enabled: z.boolean().optional(),
    archived: z.boolean().optional(),
  }),
});

monetizationAdminRouter.patch("/snippets/:id/status", validate(snippetStatusSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: { enabled?: boolean; archived?: boolean } } }).validated.body;

  const existing = await prisma.adSnippet.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Snippet not found");

  const data: { enabled?: boolean; archived?: boolean } = {};
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (body.archived !== undefined) data.archived = body.archived;

  const updated = await prisma.adSnippet.update({ where: { id }, data });
  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: body.archived ? "AD_SNIPPET_ARCHIVED" : body.enabled ? "AD_SNIPPET_ENABLED" : "AD_SNIPPET_DISABLED",
      targetType: "ad_snippet",
      targetId: id,
      details: { name: existing.name },
    },
  });
  await recordEvent("AD_SNIPPET_STATUS_CHANGED", { metadata: { name: existing.name, ...data } });

  res.json(ok(updated));
});

// ── Gates (read-only, safe monitoring) ──────────────────────

const GATE_STATUSES = ["PENDING", "VERIFIED", "EXPIRED", "FAILED", "CANCELLED"] as const;

monetizationAdminRouter.get("/gates", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { maxLimit: 100 });
  const rawStatus = req.query.status as string | undefined;
  const sessionId = req.query.sessionId as string | undefined;
  const userId = req.query.userId as string | undefined;
  const phone = req.query.phone as string | undefined;

  const status = rawStatus && (GATE_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as GateStatus) : undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (sessionId) where.sessionId = sessionId;
  if (userId) where.userId = userId;
  if (phone) where.user = { is: { phone: { contains: phone } } };

  const [total, items] = await Promise.all([
    prisma.monetizationGate.count({ where }),
    prisma.monetizationGate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, phone: true, name: true } },
        session: { select: { id: true, inviteCode: true, status: true, category: { select: { name: true } } } },
        provider: { select: { id: true, name: true } },
      },
    }),
  ]);

  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

// ── Events (read-only) ──────────────────────────────────────

const EVENT_TYPES = [
  "GATE_CREATED",
  "LINK_OPENED",
  "CODE_REQUESTED",
  "CODE_GENERATED",
  "VERIFICATION_ATTEMPT",
  "VERIFICATION_SUCCESS",
  "VERIFICATION_FAILED",
  "GATE_EXPIRED",
  "GATE_CANCELLED",
] as const;

monetizationAdminRouter.get("/events", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { maxLimit: 100 });
  const rawType = req.query.type as string | undefined;
  const sessionId = req.query.sessionId as string | undefined;
  const userId = req.query.userId as string | undefined;
  const date = req.query.date as string | undefined;

  const type = rawType && (EVENT_TYPES as readonly string[]).includes(rawType) ? rawType : undefined;

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (sessionId) where.sessionId = sessionId;
  if (userId) where.userId = userId;
  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    where.createdAt = { gte: start, lt: end };
  }

  const [total, items] = await Promise.all([
    prisma.monetizationEvent.count({ where }),
    prisma.monetizationEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        user: { select: { id: true, phone: true, name: true } },
        session: { select: { id: true, inviteCode: true } },
      },
    }),
  ]);

  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});