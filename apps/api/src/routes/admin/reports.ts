import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";
import { notify } from "../../services/notifications";

export const reportsRouter = Router();

reportsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const status = req.query.status as string | undefined;
  const reason = req.query.reason as string | undefined;
  const category = req.query.category as string | undefined;

  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ ticket: { contains: q, mode: "insensitive" } }, { reporterPhone: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }];
  if (status) where.status = status;
  if (reason) where.reason = reason;
  if (category) where.categoryId = category;

  const [total, items] = await Promise.all([
    prisma.questionReport.count({ where }),
    prisma.questionReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { category: { select: { name: true, slug: true } }, question: { select: { text: true } }, resolvedBy: { select: { name: true } } },
    }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

reportsRouter.get("/filters", async (_req, res) => {
  const [categories, reasons, statuses] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.questionReport.groupBy({ by: ["reason"], _count: { _all: true } }),
    prisma.questionReport.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  res.json(ok({
    categories,
    reasons: reasons.map((r) => ({ reason: r.reason, count: r._count._all })),
    statusCounts: statuses.map((s) => ({ status: s.status, count: s._count._all })),
  }));
});

reportsRouter.get("/:id", async (req, res) => {
  const report = await prisma.questionReport.findUnique({ where: { id: req.params.id }, include: { category: true, question: true, resolvedBy: true } });
  if (!report) throw new AppError(404, "Report not found");
  res.json(ok(report));
});

const resolveSchema = z.object({
  body: z.object({
    status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"]),
    resolution: z.string().max(1000).optional(),
  }),
});

reportsRouter.patch("/:id", validate(resolveSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof resolveSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.questionReport.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Report not found");
  const report = await prisma.questionReport.update({
    where: { id: existing.id },
    data: {
      status: body.status,
      resolution: body.resolution,
      resolvedById: body.status === "RESOLVED" || body.status === "DISMISSED" ? admin.id : null,
      resolvedAt: body.status === "RESOLVED" || body.status === "DISMISSED" ? new Date() : null,
    },
  });
  if (existing.status === "OPEN" && body.status !== "OPEN") {
    await notify({ adminId: admin.id, type: "REPORT", title: "Report updated", message: `${existing.ticket} marked as ${body.status}` });
  }
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "UPDATE", targetType: "report", targetId: report.id, details: { status: body.status } } });
  res.json(ok(report));
});
