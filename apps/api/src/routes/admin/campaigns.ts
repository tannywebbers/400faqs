import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ok, AppError } from "../../lib/response";
import { validate, parsePagination } from "../../middleware/validate";
import { type AdminRequest } from "../../middleware/auth";
import { prisma } from "../../lib/prisma";
import {
  getCampaignSettings,
  getCampaignStats,
  listCampaigns,
  getCampaign,
  listCampaignDeliveries,
  resolveAudience,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
} from "../../services/campaign";

export const campaignsRouter = Router();

const AUDIENCES = ["all_users", "active_users", "players", "contributors", "specific_users", "seed_invites"] as const;
const SCHEDULE_TYPES = ["now", "scheduled", "recurring"] as const;
const MESSAGE_TYPES = ["text", "template"] as const;

const audienceFilterSchema = z
  .object({
    lastActiveDays: z.number().int().min(1).max(3650).optional(),
    minSessions: z.number().int().min(1).max(100000).optional(),
    minContributions: z.number().int().min(1).max(100000).optional(),
    phones: z.union([z.array(z.string()), z.string()]).optional(),
  })
  .optional();

const campaignSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional().default(""),
    messageType: z.enum(MESSAGE_TYPES).default("text"),
    templateId: z.string().optional().nullable(),
    messageBody: z.string().max(1000).optional().nullable(),
    headerText: z.string().max(60).optional().nullable(),
    footerText: z.string().max(60).optional().nullable(),
    audience: z.enum(AUDIENCES).default("all_users"),
    audienceFilter: audienceFilterSchema,
    scheduleType: z.enum(SCHEDULE_TYPES).default("now"),
    scheduledAt: z.string().datetime().optional().nullable(),
    cronExpression: z.string().max(64).optional().nullable(),
    rateLimitPerMinute: z.number().int().min(1).max(100000).default(60),
  }),
});

const campaignUpdateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    messageType: z.enum(MESSAGE_TYPES).optional(),
    templateId: z.string().optional().nullable(),
    messageBody: z.string().max(1000).optional().nullable(),
    headerText: z.string().max(60).optional().nullable(),
    footerText: z.string().max(60).optional().nullable(),
    audience: z.enum(AUDIENCES).optional(),
    audienceFilter: audienceFilterSchema,
    scheduleType: z.enum(SCHEDULE_TYPES).optional(),
    scheduledAt: z.string().datetime().optional().nullable(),
    cronExpression: z.string().max(64).optional().nullable(),
    rateLimitPerMinute: z.number().int().min(1).max(100000).optional(),
  }),
});

function jsonOrNull(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

function normalizeBody(body: z.infer<typeof campaignSchema>["body"]) {
  return {
    name: body.name,
    description: body.description || null,
    messageType: body.messageType,
    templateId: body.templateId ?? null,
    messageBody: body.messageBody ?? null,
    headerText: body.headerText ?? null,
    footerText: body.footerText ?? null,
    audience: body.audience,
    audienceFilter: jsonOrNull(body.audienceFilter),
    scheduleType: body.scheduleType,
    scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    cronExpression: body.cronExpression ?? null,
    rateLimitPerMinute: body.rateLimitPerMinute,
  };
}

function assertEditable(campaign: { status: string }): void {
  if (campaign.status === "RUNNING") throw new AppError(409, "Cannot edit a running campaign — pause or cancel it first");
  if (campaign.status === "CANCELLED") throw new AppError(409, "Cancelled campaigns cannot be edited");
}

// ── List ─────────────────────────────────────────────────────

campaignsRouter.get("/", async (req, res) => {
  const { page, limit } = parsePagination(req.query, { maxLimit: 100 });
  const result = await listCampaigns({
    page,
    limit,
    status: req.query.status as string | undefined,
    q: req.query.q as string | undefined,
  });
  res.json(ok(result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages }));
});

// ── Stats ────────────────────────────────────────────────────

campaignsRouter.get("/stats", async (_req, res) => {
  const [stats, settings] = await Promise.all([getCampaignStats(), getCampaignSettings()]);
  res.json(ok({ stats, settings }));
});

// ── Audience preview ─────────────────────────────────────────

const previewSchema = z.object({
  body: z.object({
    audience: z.enum(AUDIENCES),
    audienceFilter: audienceFilterSchema,
  }),
});

campaignsRouter.post("/audience/preview", validate(previewSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof previewSchema>["body"] } }).validated.body;
  const settings = await getCampaignSettings();
  const members = await resolveAudience({
    audience: body.audience,
    audienceFilter: (body.audienceFilter ?? null) as Prisma.InputJsonValue | undefined,
    maxRecipients: settings.maxRecipients,
  });
  const seen = new Set<string>();
  const unique = members.filter((m) => (seen.has(m.phone) ? false : (seen.add(m.phone), true)));
  res.json(
    ok({
      audience: body.audience,
      filter: body.audienceFilter ?? {},
      count: unique.length,
      capped: unique.length >= settings.maxRecipients,
      cap: settings.maxRecipients,
      sample: unique.slice(0, 20),
    })
  );
});

// ── Create ───────────────────────────────────────────────────

campaignsRouter.post("/", validate(campaignSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof campaignSchema>["body"] } }).validated.body;

  if (body.messageType === "template" && !body.templateId) {
    throw new AppError(400, "Template campaigns require a templateId");
  }

  const campaign = await prisma.campaign.create({
    data: { ...normalizeBody(body), createdById: admin.id },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "CAMPAIGN_CREATED",
      targetType: "campaign",
      targetId: campaign.id,
      details: { name: campaign.name, audience: campaign.audience },
    },
  });

  res.json(ok(campaign));
});

// ── Get one ──────────────────────────────────────────────────

campaignsRouter.get("/:id", async (req, res) => {
  const campaign = await getCampaign(req.params.id);
  res.json(ok(campaign));
});

// ── Update ───────────────────────────────────────────────────

campaignsRouter.put("/:id", validate(campaignUpdateSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: Partial<z.infer<typeof campaignSchema>["body"]> } }).validated.body;

  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Campaign not found");
  assertEditable(existing);

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.messageType !== undefined) data.messageType = body.messageType;
  if (body.templateId !== undefined) data.templateId = body.templateId ?? null;
  if (body.messageBody !== undefined) data.messageBody = body.messageBody ?? null;
  if (body.headerText !== undefined) data.headerText = body.headerText ?? null;
  if (body.footerText !== undefined) data.footerText = body.footerText ?? null;
  if (body.audience !== undefined) data.audience = body.audience;
  if (body.audienceFilter !== undefined) data.audienceFilter = jsonOrNull(body.audienceFilter);
  if (body.scheduleType !== undefined) data.scheduleType = body.scheduleType;
  if (body.scheduledAt !== undefined) data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
  if (body.cronExpression !== undefined) data.cronExpression = body.cronExpression ?? null;
  if (body.rateLimitPerMinute !== undefined) data.rateLimitPerMinute = body.rateLimitPerMinute;

  const updated = await prisma.campaign.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "CAMPAIGN_UPDATED",
      targetType: "campaign",
      targetId: id,
      details: { name: updated.name },
    },
  });

  res.json(ok(updated));
});

// ── Lifecycle ────────────────────────────────────────────────

async function auditLifecycle(adminId: string, action: string, campaignId: string, details: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { adminId, action, targetType: "campaign", targetId: campaignId, details: details as Prisma.InputJsonValue },
  });
}

campaignsRouter.post("/:id/start", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const result = await startCampaign(req.params.id);
  await auditLifecycle(admin.id, "CAMPAIGN_STARTED", req.params.id, { recipients: result.total });
  res.json(ok(result));
});

campaignsRouter.post("/:id/pause", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  await pauseCampaign(req.params.id);
  await auditLifecycle(admin.id, "CAMPAIGN_PAUSED", req.params.id, {});
  res.json(ok({ message: "Campaign paused" }));
});

campaignsRouter.post("/:id/resume", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  await resumeCampaign(req.params.id);
  await auditLifecycle(admin.id, "CAMPAIGN_RESUMED", req.params.id, {});
  res.json(ok({ message: "Campaign resumed" }));
});

campaignsRouter.post("/:id/cancel", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  await cancelCampaign(req.params.id);
  await auditLifecycle(admin.id, "CAMPAIGN_CANCELLED", req.params.id, {});
  res.json(ok({ message: "Campaign cancelled" }));
});

// ── Deliveries ───────────────────────────────────────────────

campaignsRouter.get("/:id/deliveries", async (req, res) => {
  const { page, limit } = parsePagination(req.query, { maxLimit: 200 });
  const result = await listCampaignDeliveries({
    campaignId: req.params.id,
    page,
    limit,
    status: req.query.status as string | undefined,
    q: req.query.q as string | undefined,
  });
  res.json(ok(result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages }));
});

// ── CSV export ───────────────────────────────────────────────

campaignsRouter.get("/:id/export", async (req, res) => {
  const campaign = await getCampaign(req.params.id);
  const deliveries = await prisma.campaignDelivery.findMany({
    where: { campaignId: req.params.id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { phone: true, displayName: true, name: true } } },
  });

  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["phone", "status", "attempt", "sentAt", "deliveredAt", "readAt", "error", "userId"].join(",");
  const rows = deliveries.map((d) =>
    [d.phone, d.status, d.attempt, d.sentAt?.toISOString() ?? "", d.deliveredAt?.toISOString() ?? "", d.readAt?.toISOString() ?? "", d.error ?? "", d.userId ?? ""]
      .map(escape)
      .join(",")
  );

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="campaign-${campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv"`);
  res.send([header, ...rows].join("\n"));
});