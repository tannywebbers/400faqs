import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { slugify } from "../../lib/slugify";
import { type AdminRequest } from "../../middleware/auth";
import { cacheDel } from "../../lib/redis";

export const articlesRouter = Router();

articlesRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const status = req.query.status as string | undefined;
  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }];
  if (status === "active") where.status = true;
  if (status === "inactive") where.status = false;
  const [total, items] = await Promise.all([
    prisma.helpArticle.count({ where }),
    prisma.helpArticle.findMany({ where, orderBy: [{ order: "asc" }, { createdAt: "desc" }], skip, take: limit }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

const articleSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(200),
    excerpt: z.string().min(3).max(500),
    content: z.string().min(10).max(50000),
    category: z.string().min(1).max(100).default("General"),
    order: z.number().int().min(0).optional().default(0),
    status: z.boolean().optional().default(true),
  }),
});

articlesRouter.post("/", validate(articleSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof articleSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const slug = slugify(body.title);
  const article = await prisma.helpArticle.create({ data: { ...body, slug } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "CREATE", targetType: "article", targetId: article.id } });
  await cacheDel("cache:public:articles");
  res.json(ok(article));
});

articlesRouter.put("/:id", validate(articleSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof articleSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.helpArticle.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Article not found");
  const slug = slugify(body.title);
  const article = await prisma.helpArticle.update({ where: { id: existing.id }, data: { ...body, slug } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "UPDATE", targetType: "article", targetId: article.id } });
  await cacheDel("cache:public:articles");
  res.json(ok(article));
});

articlesRouter.delete("/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.helpArticle.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Article not found");
  await prisma.helpArticle.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "DELETE", targetType: "article", targetId: existing.id } });
  await cacheDel("cache:public:articles");
  res.json(ok({ message: "Article deleted" }));
});
