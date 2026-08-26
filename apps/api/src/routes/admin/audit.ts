import { Router } from "express";
import { parsePagination } from "../../middleware/validate";
import { ok } from "../../lib/response";
import { prisma } from "../../lib/prisma";
import { type AdminRequest } from "../../middleware/auth";

export const auditRouter = Router();

auditRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const action = req.query.action as string | undefined;
  const adminId = req.query.adminId as string | undefined;

  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ action: { contains: q, mode: "insensitive" } }, { targetType: { contains: q, mode: "insensitive" } }];
  if (action) where.action = action;
  if (adminId) where.adminId = adminId;

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: { admin: { select: { name: true, email: true } } } }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

auditRouter.get("/actions", async (_req, res) => {
  const rows = await prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } });
  res.json(ok(rows.map((r) => ({ action: r.action, count: r._count._all }))));
});

auditRouter.get("/recent", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const recent = await prisma.auditLog.findMany({
    where: { adminId: admin.id },
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { admin: { select: { name: true } } },
  });
  res.json(ok(recent));
});
