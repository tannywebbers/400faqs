import { Router } from "express";
import { z } from "zod";
import { SessionStatus, Prisma } from "@prisma/client";
import { ok, AppError } from "../../lib/response";
import { prisma } from "../../lib/prisma";
import { validate } from "../../middleware/validate";
import { sendText } from "../../lib/whatsapp";
import { type AdminRequest } from "../../middleware/auth";
import {
  getMaskedConfig,
  updateWhatsAppConfig,
  checkConnectionStatus,
  getWebhookUrl,
  regenerateVerifyToken,
} from "../../services/whatsapp-config";
import { sendTextMessage, getMessageLogs } from "../../services/messaging";
import {
  validateTemplate,
  markTemplateSubmitted,
  markTemplateMetaStatus,
  getTemplateStats,
  previewTemplatePayload,
} from "../../services/template.service";
import { logger } from "../../lib/logger";

export const whatsappRouter = Router();

// ── Connection Status ────────────────────────────────────────

whatsappRouter.get("/status", async (_req, res) => {
  const [config, connection] = await Promise.all([getMaskedConfig(), checkConnectionStatus()]);
  const [sessions, messagesInbound, messagesOutbound] = await Promise.all([
    prisma.session.count({ where: { status: { in: ["WAITING", "ACTIVE"] as SessionStatus[] } } }),
    prisma.messageLog.count({ where: { direction: "inbound" } }),
    prisma.messageLog.count({ where: { direction: "outbound" } }),
  ]);
  res.json(
    ok({
      ...config,
      connection,
      stats: {
        activeSessions: sessions,
        messagesInbound,
        messagesOutbound,
        totalMessages: messagesInbound + messagesOutbound,
      },
      webhookUrl: getWebhookUrl(),
    })
  );
});

// ── Config CRUD ──────────────────────────────────────────────

whatsappRouter.get("/config", async (_req, res) => {
  const config = await getMaskedConfig();
  res.json(ok(config));
});

const configUpdateSchema = z.object({
  body: z.object({
    accessToken: z.string().min(1).optional(),
    phoneNumberId: z.string().min(1).optional(),
    businessAccountId: z.string().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    graphVersion: z.string().optional(),
    apiBase: z.string().url().optional(),
    webhookVerifyToken: z.string().optional(),
  }),
});

whatsappRouter.put("/config", validate(configUpdateSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: Record<string, string | undefined> } }).validated.body;

  const filtered: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== "") filtered[k] = v;
  }

  const updated = await updateWhatsAppConfig(filtered);

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "WHATSAPP_CONFIG_UPDATE",
      targetType: "whatsapp",
      details: { fields: Object.keys(filtered) },
    },
  });

  res.json(ok(updated));
});

// ── Webhook ──────────────────────────────────────────────────

whatsappRouter.get("/webhook", async (_req, res) => {
  const config = await getMaskedConfig();
  res.json(
    ok({
      url: getWebhookUrl(),
      verifyToken: config.webhookVerifyToken,
      graphVersion: config.graphVersion,
    })
  );
});

whatsappRouter.post("/webhook/regenerate", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const result = await regenerateVerifyToken();

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "WEBHOOK_TOKEN_REGENERATE",
      targetType: "whatsapp",
      details: { webhookUrl: result.webhookUrl },
    },
  });

  res.json(ok(result));
});

// ── Message Templates ────────────────────────────────────────

whatsappRouter.get("/templates", async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const status = req.query.status as string | undefined;
  const q = (req.query.q as string | undefined)?.trim();
  const category = req.query.category as string | undefined;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (category) where.category = category;
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }];

  const [total, items] = await Promise.all([
    prisma.messageTemplate.count({ where }),
    prisma.messageTemplate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { campaigns: true } } },
    }),
  ]);

  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

const templateSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    category: z.string().default("UTILITY"),
    language: z.string().default("en"),
    header: z.string().max(60).optional(),
    body: z.string().min(1).max(1024),
    footer: z.string().max(60).optional(),
    buttons: z
      .array(z.object({ id: z.string(), title: z.string() }))
      .max(3)
      .optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  }),
});

whatsappRouter.post("/templates", validate(templateSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof templateSchema>["body"] } }).validated.body;

  const template = await prisma.messageTemplate.create({
    data: {
      name: body.name,
      category: body.category,
      language: body.language,
      header: body.header ?? null,
      body: body.body,
      footer: body.footer ?? null,
      buttons: (body.buttons ?? null) as Prisma.InputJsonValue,
      status: body.status,
    },
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "TEMPLATE_CREATE",
      targetType: "message_template",
      targetId: template.id,
      details: { name: template.name },
    },
  });

  res.json(ok(template));
});

const templateUpdateSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    category: z.string().optional(),
    language: z.string().optional(),
    header: z.string().max(60).optional().nullable(),
    body: z.string().min(1).max(1024).optional(),
    footer: z.string().max(60).optional().nullable(),
    buttons: z
      .array(z.object({ id: z.string(), title: z.string() }))
      .max(3)
      .optional()
      .nullable(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  }),
});

whatsappRouter.put("/templates/:id", validate(templateUpdateSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: Record<string, unknown> } }).validated.body;

  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Template not found");

  const updated = await prisma.messageTemplate.update({
    where: { id },
    data: body,
  });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "TEMPLATE_UPDATE",
      targetType: "message_template",
      targetId: id,
      details: { name: updated.name },
    },
  });

  res.json(ok(updated));
});

whatsappRouter.delete("/templates/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = req.params;

  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "Template not found");

  await prisma.messageTemplate.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "TEMPLATE_DELETE",
      targetType: "message_template",
      targetId: id,
      details: { name: existing.name },
    },
  });

  res.json(ok({ message: "Template deleted" }));
});

// ── Template library (Phase 10) ──────────────────────────────

whatsappRouter.get("/templates/stats", async (_req, res) => {
  res.json(ok(await getTemplateStats()));
});

const templateValidateSchema = z.object({
  body: z.object({
    name: z.string(),
    category: z.string().default("UTILITY"),
    language: z.string().default("en"),
    header: z.string().nullable().optional(),
    body: z.string(),
    footer: z.string().nullable().optional(),
    buttons: z.array(z.object({ id: z.string(), title: z.string() })).max(3).optional(),
  }),
});

whatsappRouter.post("/templates/validate", validate(templateValidateSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof templateValidateSchema>["body"] } }).validated.body;
  const validation = await validateTemplate(body);
  res.json(ok({ validation, preview: previewTemplatePayload(body) }));
});

whatsappRouter.post("/templates/:id/submit", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const template = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) throw new AppError(404, "Template not found");

  const validation = await validateTemplate({
    name: template.name,
    category: template.category,
    language: template.language,
    header: template.header,
    body: template.body,
    footer: template.footer,
    buttons: template.buttons,
  });
  if (!validation.ok) throw new AppError(400, "Template is not valid", validation.errors);

  const result = await markTemplateSubmitted(template.id);

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "TEMPLATE_SUBMITTED",
      targetType: "message_template",
      targetId: template.id,
      details: { name: template.name, ...result },
    },
  });

  res.json(ok({ ...result, validation }));
});

const templateMetaStatusSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    metaStatus: z.string().min(1).max(50),
    reason: z.string().max(2000).optional(),
  }),
});

whatsappRouter.post("/templates/:id/meta-status", validate(templateMetaStatusSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const { id } = (req as unknown as { validated: { params: { id: string } } }).validated.params;
  const body = (req as unknown as { validated: { body: { metaStatus: string; reason?: string } } }).validated.body;

  await markTemplateMetaStatus(id, { metaStatus: body.metaStatus, reason: body.reason });

  await prisma.auditLog.create({
    data: {
      adminId: admin.id,
      action: "TEMPLATE_META_STATUS_CHANGED",
      targetType: "message_template",
      targetId: id,
      details: { metaStatus: body.metaStatus, reason: body.reason ?? null },
    },
  });

  res.json(ok({ message: "Meta status updated" }));
});

whatsappRouter.post("/templates/:id/preview", async (req, res) => {
  const template = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) throw new AppError(404, "Template not found");
  res.json(ok({ preview: previewTemplatePayload(template) }));
});

// ── Message Logs ─────────────────────────────────────────────

whatsappRouter.get("/messages", async (req, res) => {
  const result = await getMessageLogs({
    page: Number(req.query.page ?? 1),
    limit: Number(req.query.limit ?? 50),
    direction: req.query.direction as string | undefined,
    phone: req.query.phone as string | undefined,
    status: req.query.status as string | undefined,
  });
  res.json(ok(result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages }));
});

// ── Sessions (existing, preserved) ───────────────────────────

whatsappRouter.get("/stats", async (_req, res) => {
  const [sessions, moves, players] = await Promise.all([
    prisma.session.count(),
    prisma.gameMove.count(),
    prisma.user.count(),
  ]);
  res.json(ok({ sessions, moves, players }));
});

whatsappRouter.get("/sessions", async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const rawStatus = req.query.status as string | undefined;
  const where = rawStatus ? { status: rawStatus as SessionStatus } : undefined;
  const [total, items] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        creator: { select: { phone: true, name: true } },
        joiner: { select: { phone: true, name: true } },
        category: { select: { name: true } },
        _count: { select: { moves: true } },
      },
    }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

whatsappRouter.get("/sessions/:id", async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: {
      creator: true,
      joiner: true,
      winner: true,
      category: true,
      moves: {
        include: {
          question: true,
          askedByUser: { select: { phone: true } },
          answeredByUser: { select: { phone: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!session) throw new AppError(404, "Session not found");
  res.json(ok(session));
});

// ── Test Send ────────────────────────────────────────────────

const testSchema = z.object({
  body: z.object({
    phone: z.string().min(8).max(20),
    message: z.string().min(1).max(1000),
  }),
});

whatsappRouter.post("/test-send", validate(testSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: { phone: string; message: string } } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const result = await sendTextMessage(body.phone, body.message, {});
  if (!result.ok) throw new AppError(500, `Failed to send: ${result.error ?? "unknown"}`);
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "TEST_SEND", targetType: "whatsapp", details: { phone: body.phone } },
  });
  res.json(ok({ message: "Message sent" }));
});
