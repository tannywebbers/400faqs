import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";

export const usersRouter = Router();

usersRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const status = req.query.status as string | undefined;
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ phone: { contains: q } }, { name: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }];
  if (status === "active") where.status = "ACTIVE";
  if (status === "banned") where.status = "BANNED";

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { _count: { select: { contributions: true, sessionsCreated: true, badges: true, reports: true } } },
    }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

usersRouter.get("/:id", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      badges: { include: { badge: true } },
      contributions: { include: { category: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
      sessionsCreated: { include: { category: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!user) throw new AppError(404, "User not found");
  res.json(ok(user));
});

const updateSchema = z.object({
  body: z.object({
    name: z.string().max(100).optional(),
    displayName: z.string().max(100).optional(),
    publicProfile: z.boolean().optional(),
    status: z.enum(["ACTIVE", "BANNED"]).optional(),
  }),
});

usersRouter.patch("/:id", validate(updateSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof updateSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "User not found");
  const user = await prisma.user.update({ where: { id: existing.id }, data: body });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "UPDATE", targetType: "user", targetId: user.id, details: body } });
  res.json(ok(user));
});

usersRouter.post("/:id/badge", async (req, res) => {
  const { badgeId } = req.body as { badgeId?: string };
  if (!badgeId) throw new AppError(400, "badgeId required");
  const admin = (req as unknown as AdminRequest).admin;
  const userBadge = await prisma.userBadge.upsert({
    where: { userId_badgeId: { userId: req.params.id, badgeId } },
    update: {},
    create: { userId: req.params.id, badgeId },
  });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "AWARD_BADGE", targetType: "user", targetId: req.params.id, details: { badgeId } } });
  res.json(ok(userBadge));
});

usersRouter.delete("/:id/badge/:badgeId", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  await prisma.userBadge.delete({ where: { userId_badgeId: { userId: req.params.id, badgeId: req.params.badgeId } } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "REVOKE_BADGE", targetType: "user", targetId: req.params.id } });
  res.json(ok({ message: "Badge revoked" }));
});
