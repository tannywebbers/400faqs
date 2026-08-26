import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { slugify } from "../../lib/slugify";
import { type AdminRequest } from "../../middleware/auth";
import { cacheDel } from "../../lib/redis";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const status = req.query.status as string | undefined;
  const sort = String(req.query.sort ?? "newest");

  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];
  if (status === "active") where.status = "ACTIVE";
  if (status === "archived") where.status = "ARCHIVED";

  const orderBy: Record<string, string>[] = (() => {
    switch (sort) {
      case "name":
        return [{ name: "asc" }];
      case "play_count":
        return [{ playCount: "desc" }];
      case "question_count":
        return [{ questionCount: "desc" }];
      default:
        return [{ createdAt: "desc" }];
    }
  })();

  const [total, items] = await Promise.all([
    prisma.category.count({ where }),
    prisma.category.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { _count: { select: { questions: true, sessions: true, contributions: true } } },
    }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

categoriesRouter.get("/:id", async (req, res) => {
  const category = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!category) throw new AppError(404, "Category not found");
  res.json(ok(category));
});

const categorySchema = z.object({
  body: z.object({
    name: z.string().min(2).max(60),
    description: z.string().min(5).max(1000),
    rules: z.string().max(2000).optional().nullable(),
    icon: z.string().max(50).optional().default("Sparkles"),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#2F80ED"),
    gameType: z.enum(["NORMAL", "TRUTH_DARE"]).optional().default("NORMAL"),
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional().default("ACTIVE"),
    trending: z.boolean().optional().default(false),
  }),
});

categoriesRouter.post("/", validate(categorySchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof categorySchema.shape.body> } }).validated.body;
  const slug = slugify(body.name);
  const existing = await prisma.category.findFirst({ where: { OR: [{ slug }, { name: { equals: body.name, mode: "insensitive" } }] } });
  if (existing) throw new AppError(409, "A category with this name already exists");
  const admin = (req as unknown as AdminRequest).admin;
  const category = await prisma.category.create({
    data: { ...body, slug, createdById: admin.id },
  });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "CREATE", targetType: "category", targetId: category.id, details: { name: category.name } } });
  await cacheDel("cache:public:categories");
  res.json(ok(category));
});

categoriesRouter.put("/:id", validate(categorySchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof categorySchema.shape.body> } }).validated.body;
  const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Category not found");
  const slug = slugify(body.name);
  const clash = await prisma.category.findFirst({ where: { OR: [{ slug }, { name: { equals: body.name, mode: "insensitive" } }], NOT: { id: existing.id } } });
  if (clash) throw new AppError(409, "A category with this name already exists");
  const admin = (req as unknown as AdminRequest).admin;
  const category = await prisma.category.update({ where: { id: existing.id }, data: { ...body, slug } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "UPDATE", targetType: "category", targetId: category.id, details: { name: category.name } } });
  await cacheDel("cache:public:categories");
  res.json(ok(category));
});

categoriesRouter.delete("/:id", async (req, res) => {
  const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Category not found");
  const admin = (req as unknown as AdminRequest).admin;
  await prisma.category.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "DELETE", targetType: "category", targetId: existing.id, details: { name: existing.name } } });
  await cacheDel("cache:public:categories");
  res.json(ok({ message: "Category deleted" }));
});

categoriesRouter.patch("/:id/archive", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const category = await prisma.category.update({ where: { id: req.params.id }, data: { status: "ARCHIVED" } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "ARCHIVE", targetType: "category", targetId: category.id } });
  await cacheDel("cache:public:categories");
  res.json(ok(category));
});
