import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";
import { getAdminLanding, invalidateLandingCache } from "../../services/landing";

export const landingAdminRouter = Router();

landingAdminRouter.get("/", async (_req, res) => {
  res.json(ok(await getAdminLanding()));
});

// Re-seed missing default sections (idempotent, safe to call repeatedly).
landingAdminRouter.post("/seed", async (_req, res) => {
  res.json(ok(await getAdminLanding()));
});

const updateSchema = z.object({
  body: z.object({
    title: z.string().max(500).nullable().optional(),
    subtitle: z.string().max(1000).nullable().optional(),
    content: z.string().max(100000).nullable().optional(),
    imageUrl: z.string().max(2000).nullable().optional(),
    buttonText: z.string().max(200).nullable().optional(),
    buttonUrl: z.string().max(2000).nullable().optional(),
    isVisible: z.boolean().optional(),
  }),
});

landingAdminRouter.put("/:id", validate(updateSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.landingContent.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Section not found");
  const body = (req as unknown as { validated: { body: z.infer<typeof updateSchema.shape.body> } }).validated.body;

  const data: Record<string, unknown> = {};
  for (const key of ["title", "subtitle", "content", "imageUrl", "buttonText", "buttonUrl"] as const) {
    if (key in body) data[key] = body[key];
  }
  if (typeof body.isVisible === "boolean") data.isVisible = body.isVisible;

  const updated = await prisma.landingContent.update({ where: { id: existing.id }, data });
  await invalidateLandingCache();
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "UPDATE", targetType: "landing_content", targetId: updated.id, details: { key: updated.sectionKey } },
  });
  res.json(ok(updated));
});

const reorderSchema = z.object({
  body: z.object({
    items: z
      .array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0) }))
      .min(1)
      .max(100),
  }),
});

landingAdminRouter.post("/reorder", validate(reorderSchema), async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const body = (req as unknown as { validated: { body: z.infer<typeof reorderSchema.shape.body> } }).validated.body;
  const transaction = body.items.map((item) =>
    prisma.landingContent.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })
  );
  await prisma.$transaction(transaction);
  await prisma.auditLog.create({
    data: { adminId: admin.id, action: "UPDATE", targetType: "landing_content", details: { reordered: body.items.map((i) => i.id) } },
  });
  await invalidateLandingCache();
  res.json(ok({ message: "Order updated" }));
});