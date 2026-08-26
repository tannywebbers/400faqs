import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { slugify } from "../../lib/slugify";
import { type AdminRequest } from "../../middleware/auth";

export const badgesRouter = Router();

badgesRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];
  const [total, items] = await Promise.all([
    prisma.badge.count({ where }),
    prisma.badge.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: { _count: { select: { users: true } } } }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

const badgeSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(80),
    description: z.string().max(500).optional(),
    icon: z.string().max(50).optional().default("Award"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#F2994A"),
  }),
});

badgesRouter.post("/", validate(badgeSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof badgeSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const badge = await prisma.badge.create({ data: { ...body, slug: slugify(body.name) } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "CREATE", targetType: "badge", targetId: badge.id } });
  res.json(ok(badge));
});

badgesRouter.put("/:id", validate(badgeSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof badgeSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.badge.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Badge not found");
  const badge = await prisma.badge.update({ where: { id: existing.id }, data: { ...body, slug: slugify(body.name) } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "UPDATE", targetType: "badge", targetId: badge.id } });
  res.json(ok(badge));
});

badgesRouter.delete("/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.badge.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Badge not found");
  await prisma.badge.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "DELETE", targetType: "badge", targetId: existing.id } });
  res.json(ok({ message: "Badge deleted" }));
});
