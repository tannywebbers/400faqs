import { Router } from "express";
import { z } from "zod";
import { SessionStatus } from "@prisma/client";
import { ok } from "../../lib/response";
import { prisma } from "../../lib/prisma";
import { validate } from "../../middleware/validate";
import { sendText, whatsappConfigured, waPhoneNumberId } from "../../lib/whatsapp";
import { config } from "../../config";
import { type AdminRequest } from "../../middleware/auth";
import { AppError } from "../../lib/response";

export const whatsappRouter = Router();

whatsappRouter.get("/status", async (_req, res) => {
  res.json(
    ok({
      configured: whatsappConfigured(),
      phoneNumberId: waPhoneNumberId(),
      webhookUrl: `${config.apiUrl}/api/webhooks/whatsapp`,
      verifyToken: config.whatsapp.verifyToken,
      graphVersion: config.whatsapp.graphVersion,
    })
  );
});

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
      moves: { include: { question: true, askedByUser: { select: { phone: true } }, answeredByUser: { select: { phone: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) throw new AppError(404, "Session not found");
  res.json(ok(session));
});

const testSchema = z.object({
  body: z.object({
    phone: z.string().min(8).max(20),
    message: z.string().min(1).max(1000),
  }),
});

whatsappRouter.post("/test-send", validate(testSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: { phone: string; message: string } } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const result = await sendText(body.phone, body.message);
  if (!result.ok) throw new AppError(500, `Failed to send: ${result.error ?? "unknown"}`);
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "TEST_SEND", targetType: "whatsapp", details: { phone: body.phone } } });
  res.json(ok({ message: "Message sent" }));
});
