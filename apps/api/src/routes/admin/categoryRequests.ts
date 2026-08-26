import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { slugify } from "../../lib/slugify";
import { type AdminRequest } from "../../middleware/auth";
import { notify } from "../../services/notifications";

export const categoryRequestsRouter = Router();

categoryRequestsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const status = req.query.status as string | undefined;
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { requestorPhone: { contains: q, mode: "insensitive" } }];
  if (status) where.status = status;

  const [total, items] = await Promise.all([
    prisma.categoryRequest.count({ where }),
    prisma.categoryRequest.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: { reviewedBy: { select: { name: true } } } }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

categoryRequestsRouter.get("/:id", async (req, res) => {
  const row = await prisma.categoryRequest.findUnique({ where: { id: req.params.id } });
  if (!row) throw new AppError(404, "Request not found");
  res.json(ok(row));
});

const reviewSchema = z.object({
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    note: z.string().max(1000).optional(),
  }),
});

categoryRequestsRouter.patch("/:id", validate(reviewSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof reviewSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.categoryRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Request not found");

  const updated = await prisma.categoryRequest.update({
    where: { id: existing.id },
    data: { status: body.status, note: body.note, reviewedById: admin.id, reviewedAt: new Date() },
  });

  if (body.status === "APPROVED") {
    const category = await prisma.category.create({
      data: {
        name: existing.name,
        slug: slugify(existing.name),
        description: existing.description,
        rules: existing.examples ?? undefined,
        createdById: admin.id,
      },
    });
    await notify({
      type: "CATEGORY_REQ",
      title: "Category approved",
      message: `Your requested category "${existing.name}" has been approved.`,
      link: `/categories/${category.slug}`,
    });
    await prisma.auditLog.create({ data: { adminId: admin.id, action: "APPROVE", targetType: "category-request", targetId: existing.id, details: { categoryId: category.id } } });
  } else {
    await notify({ type: "CATEGORY_REQ", title: "Category request update", message: `Your request for "${existing.name}" was ${body.status.toLowerCase()}.` });
    await prisma.auditLog.create({ data: { adminId: admin.id, action: "REJECT", targetType: "category-request", targetId: existing.id } });
  }
  res.json(ok(updated));
});

categoryRequestsRouter.delete("/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.categoryRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Request not found");
  await prisma.categoryRequest.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "DELETE", targetType: "category-request", targetId: existing.id } });
  res.json(ok({ message: "Request deleted" }));
});
