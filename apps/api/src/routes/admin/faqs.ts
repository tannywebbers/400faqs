import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";
import { cacheDel } from "../../lib/redis";

export const faqsRouter = Router();

faqsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const status = req.query.status as string | undefined;
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ question: { contains: q, mode: "insensitive" } }, { answer: { contains: q, mode: "insensitive" } }];
  if (status === "active") where.status = true;
  if (status === "inactive") where.status = false;
  const [total, items] = await Promise.all([
    prisma.faq.count({ where }),
    prisma.faq.findMany({ where, orderBy: [{ order: "asc" }, { createdAt: "desc" }], skip, take: limit }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

const faqSchema = z.object({
  body: z.object({
    question: z.string().min(3).max(300),
    answer: z.string().min(3).max(5000),
    order: z.number().int().min(0).optional().default(0),
    status: z.boolean().optional().default(true),
  }),
});

faqsRouter.post("/", validate(faqSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof faqSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const faq = await prisma.faq.create({ data: body });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "CREATE", targetType: "faq", targetId: faq.id } });
  await cacheDel("cache:public:faqs");
  res.json(ok(faq));
});

faqsRouter.put("/:id", validate(faqSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof faqSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.faq.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "FAQ not found");
  const faq = await prisma.faq.update({ where: { id: existing.id }, data: body });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "UPDATE", targetType: "faq", targetId: faq.id } });
  await cacheDel("cache:public:faqs");
  res.json(ok(faq));
});

faqsRouter.delete("/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.faq.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "FAQ not found");
  await prisma.faq.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "DELETE", targetType: "faq", targetId: existing.id } });
  await cacheDel("cache:public:faqs");
  res.json(ok({ message: "FAQ deleted" }));
});
