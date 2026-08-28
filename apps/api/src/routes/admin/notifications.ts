import { Router } from "express";
import { z } from "zod";
import { parsePagination, validate } from "../../middleware/validate";
import { ok } from "../../lib/response";
import { prisma } from "../../lib/prisma";
import { broadcastNotification } from "../../services/notifications";
import { logAudit } from "../../lib/audit";
import { type AdminRequest } from "../../middleware/auth";
import { AppError } from "../../lib/response";

export const notificationsRouter = Router();

notificationsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const admin = (req as unknown as AdminRequest).admin;
  const where = { adminId: admin.id };
  const [total, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
  ]);
  const unread = await prisma.notification.count({ where: { ...where, readAt: null } });
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit), unread }));
});

notificationsRouter.get("/unread-count", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const count = await prisma.notification.count({ where: { adminId: admin.id, readAt: null } });
  res.json(ok({ count }));
});

notificationsRouter.post("/:id/read", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.adminId !== admin.id) throw new AppError(404, "Notification not found");
  const n = await prisma.notification.update({ where: { id: existing.id }, data: { readAt: new Date() } });
  res.json(ok(n));
});

notificationsRouter.post("/read-all", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  await prisma.notification.updateMany({ where: { adminId: admin.id, readAt: null }, data: { readAt: new Date() } });
  res.json(ok({ message: "All notifications marked as read" }));
});

// ============================================================
// System broadcast — the "warning center": send a message to a
// targeted slice of the player base, delivered via the notification
// worker at a throttled pace. Audited like every mutating admin op.
// ============================================================

const broadcastSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(120),
    message: z.string().min(1).max(1000),
    audience: z.enum(["ALL", "ACTIVE", "INACTIVE"]),
    channel: z.enum(["WHATSAPP", "WEB"]).optional(),
    link: z.string().max(500).optional(),
  }),
});

notificationsRouter.post("/broadcast", validate(broadcastSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof broadcastSchema.shape.body> } }).validated.body;

  const result = await broadcastNotification({
    title: body.title,
    message: body.message,
    audience: body.audience,
    channel: body.channel ?? "WHATSAPP",
    link: body.link,
  });

  logAudit({
    adminId: admin.id,
    action: "notification.broadcast",
    targetType: "notification",
    details: { title: body.title, audience: body.audience, recipients: result.recipients },
  });

  res.json(ok({ message: `Broadcast queued for ${result.recipients} recipient(s)`, recipients: result.recipients }));
});