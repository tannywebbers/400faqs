import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";
import { nextFreeNumber } from "../../lib/questionNumber";

export const questionsRouter = Router();

questionsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;
  const type = req.query.type as string | undefined;

  const where: Record<string, unknown> = {};
  if (q) where.text = { contains: q, mode: "insensitive" };
  if (status) where.status = status;
  if (category) where.categoryId = category;
  if (type) where.type = type;

  const [total, items] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { category: { select: { name: true, slug: true, color: true } }, contributor: { select: { phone: true, name: true } }, reviewedBy: { select: { name: true } } },
    }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

questionsRouter.get("/filters", async (_req, res) => {
  const [categories, statuses] = await Promise.all([
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.question.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  res.json(ok({ categories, statusCounts: statuses.map((s) => ({ status: s.status, count: s._count._all })) }));
});

questionsRouter.get("/:id", async (req, res) => {
  const question = await prisma.question.findUnique({ where: { id: req.params.id }, include: { category: true, contributor: true, reviewedBy: true } });
  if (!question) throw new AppError(404, "Question not found");
  res.json(ok(question));
});

const questionSchema = z.object({
  body: z.object({
    text: z.string().min(3).max(300),
    type: z.enum(["TRUTH", "DARE", "NORMAL"]).default("NORMAL"),
    categoryId: z.string().min(1),
    difficulty: z.number().int().min(1).max(5).optional().default(1),
    status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  }),
});

questionsRouter.post("/", validate(questionSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof questionSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
  if (!category) throw new AppError(404, "Category not found");
  const number = await nextFreeNumber(prisma, body.categoryId);
  const question = await prisma.question.create({
    data: {
      text: body.text,
      type: body.type,
      categoryId: body.categoryId,
      number,
      difficulty: body.difficulty,
      status: body.status ?? "APPROVED",
      source: "ADMIN",
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });
  await prisma.category.update({ where: { id: body.categoryId }, data: { questionCount: { increment: 1 } } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "CREATE", targetType: "question", targetId: question.id, details: { text: question.text.slice(0, 80) } } });
  res.json(ok(question));
});

const reviewSchema = z.object({
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    rejectionReason: z.string().max(500).optional(),
  }),
});

questionsRouter.patch("/:id/review", validate(reviewSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof reviewSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const question = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!question) throw new AppError(404, "Question not found");

  const updated = await prisma.question.update({
    where: { id: question.id },
    data: {
      status: body.status,
      number: body.status === "APPROVED" && question.number === null ? await nextFreeNumber(prisma, question.categoryId) : question.number,
      rejectionReason: body.status === "REJECTED" ? (body.rejectionReason ?? null) : null,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });
  if (body.status === "APPROVED" && question.status !== "APPROVED") {
    await prisma.category.update({ where: { id: question.categoryId }, data: { questionCount: { increment: 1 } } });
  }
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "REVIEW", targetType: "question", targetId: question.id, details: { status: body.status } } });
  res.json(ok(updated));
});

questionsRouter.put("/:id", validate(questionSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof questionSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Question not found");
  const question = await prisma.question.update({ where: { id: existing.id }, data: { text: body.text, type: body.type, categoryId: body.categoryId, difficulty: body.difficulty } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "UPDATE", targetType: "question", targetId: question.id } });
  res.json(ok(question));
});

questionsRouter.delete("/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Question not found");
  await prisma.question.delete({ where: { id: existing.id } });
  if (existing.status === "APPROVED") {
    await prisma.category.update({ where: { id: existing.categoryId }, data: { questionCount: { decrement: 1 } } });
  }
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "DELETE", targetType: "question", targetId: existing.id, details: { text: existing.text.slice(0, 80) } } });
  res.json(ok({ message: "Question deleted" }));
});
