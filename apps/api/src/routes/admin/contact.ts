import { Router } from "express";
import { parsePagination } from "../../middleware/validate";
import { ok } from "../../lib/response";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";

export const contactRouter = Router();

contactRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const status = req.query.status as string | undefined;
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }];
  if (status) where.status = status;
  const [total, items] = await Promise.all([
    prisma.contactMessage.count({ where }),
    prisma.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

contactRouter.patch("/:id", async (req, res) => {
  const { status } = req.body as { status?: string };
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.contactMessage.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Message not found");
  const updated = await prisma.contactMessage.update({ where: { id: existing.id }, data: { status: status ?? "read" } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "UPDATE", targetType: "contact", targetId: updated.id } });
  res.json(ok(updated));
});

contactRouter.delete("/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.contactMessage.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Message not found");
  await prisma.contactMessage.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "DELETE", targetType: "contact", targetId: existing.id } });
  res.json(ok({ message: "Message deleted" }));
});
