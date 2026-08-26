import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";

export const adsRouter = Router();

adsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const placement = req.query.placement as string | undefined;
  const status = req.query.status as string | undefined;
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { subtitle: { contains: q, mode: "insensitive" } }];
  if (placement) where.placement = placement;
  if (status === "active") where.status = true;
  if (status === "inactive") where.status = false;

  const [total, items] = await Promise.all([
    prisma.ad.count({ where }),
    prisma.ad.findMany({ where, orderBy: [{ order: "asc" }, { createdAt: "desc" }], skip, take: limit }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

const adSchema = z.object({
  body: z.object({
    title: z.string().min(2).max(120),
    subtitle: z.string().max(300).optional().nullable(),
    imageUrl: z.string().max(1000).optional().nullable(),
    linkUrl: z.string().max(1000).optional().nullable(),
    placement: z.enum(["HERO", "SIDEBAR", "INLINE"]).default("HERO"),
    status: z.boolean().optional().default(true),
    order: z.number().int().min(0).optional().default(0),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
  }),
});

adsRouter.post("/", validate(adSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof adSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const ad = await prisma.ad.create({
    data: {
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
    },
  });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "CREATE", targetType: "ad", targetId: ad.id } });
  res.json(ok(ad));
});

adsRouter.put("/:id", validate(adSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof adSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.ad.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Ad not found");
  const ad = await prisma.ad.update({
    where: { id: existing.id },
    data: {
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
    },
  });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "UPDATE", targetType: "ad", targetId: ad.id } });
  res.json(ok(ad));
});

adsRouter.patch("/:id/toggle", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.ad.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Ad not found");
  const ad = await prisma.ad.update({ where: { id: existing.id }, data: { status: !existing.status } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "TOGGLE", targetType: "ad", targetId: ad.id, details: { status: ad.status } } });
  res.json(ok(ad));
});

adsRouter.delete("/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.ad.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Ad not found");
  await prisma.ad.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "DELETE", targetType: "ad", targetId: existing.id } });
  res.json(ok({ message: "Ad deleted" }));
});
