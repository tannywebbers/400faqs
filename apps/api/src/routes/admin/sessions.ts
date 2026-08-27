import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { parsePagination } from "../../middleware/validate";
import { ok } from "../../lib/response";
import { AppError } from "../../lib/response";

export const sessionsRouter = Router();

sessionsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (category) where.categoryId = category;

  const [total, items] = await Promise.all([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        creator: { select: { phone: true, name: true } },
        joiner: { select: { phone: true, name: true } },
        category: { select: { name: true, slug: true } },
        _count: { select: { moves: true } },
      },
    }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

sessionsRouter.get("/filters", async (_req, res) => {
  const [statuses, categories] = await Promise.all([
    prisma.session.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  res.json(ok({
    statusCounts: statuses.map((s) => ({ status: s.status, count: s._count._all })),
    categories,
  }));
});

sessionsRouter.get("/:id", async (req, res) => {
  const session = await prisma.session.findUnique({
    where: { id: req.params.id },
    include: {
      creator: { select: { id: true, phone: true, name: true } },
      joiner: { select: { id: true, phone: true, name: true } },
      winner: { select: { name: true } },
      category: { select: { name: true, slug: true } },
      moves: {
        include: {
          question: { select: { text: true, type: true } },
          askedByUser: { select: { phone: true, name: true } },
          answeredByUser: { select: { phone: true, name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!session) throw new AppError(404, "Session not found");
  res.json(ok(session));
});
