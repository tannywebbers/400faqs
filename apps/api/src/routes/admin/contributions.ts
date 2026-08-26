import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { validate, parsePagination } from "../../middleware/validate";
import { AppError, ok } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";

export const contributionsRouter = Router();

contributionsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const status = req.query.status as string | undefined;
  const category = req.query.category as string | undefined;
  const ticket = req.query.ticket as string | undefined;

  const where: Record<string, unknown> = {};
  if (q) where.OR = [{ question: { contains: q, mode: "insensitive" } }, { userPhone: { contains: q, mode: "insensitive" } }];
  if (status) where.status = status;
  if (category) where.categoryId = category;
  if (ticket) where.ticket = ticket;

  const [total, items] = await Promise.all([
    prisma.contribution.count({ where }),
    prisma.contribution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { category: { select: { name: true, slug: true } }, duplicateOf: { select: { text: true } }, reviewedBy: { select: { name: true } } },
    }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

contributionsRouter.get("/stats", async (_req, res) => {
  const rows = await prisma.contribution.groupBy({ by: ["status"], _count: { _all: true } });
  res.json(ok(rows.map((r) => ({ status: r.status, count: r._count._all }))));
});

const reviewSchema = z.object({
  body: z.object({
    status: z.enum(["APPROVED", "REJECTED", "FLAGGED"]),
    rejectionReason: z.string().max(500).optional(),
  }),
});

contributionsRouter.patch("/:id/review", validate(reviewSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof reviewSchema.shape.body> } }).validated.body;
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.contribution.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Contribution not found");

  const updated = await prisma.contribution.update({
    where: { id: existing.id },
    data: { status: body.status, rejectionReason: body.status === "REJECTED" ? (body.rejectionReason ?? null) : null, reviewedById: admin.id, reviewedAt: new Date() },
  });

  if (body.status === "APPROVED") {
    const question = await prisma.question.create({
      data: {
        text: existing.question,
        type: existing.type,
        categoryId: existing.categoryId,
        status: "APPROVED",
        source: "COMMUNITY",
        contributorId: existing.userId,
        aiScore: existing.aiScore,
      },
    });
    await prisma.category.update({ where: { id: existing.categoryId }, data: { questionCount: { increment: 1 } } });
    if (existing.userId) {
      await prisma.userBadge.upsert({
        where: { userId_badgeId: { userId: existing.userId, badgeId: "" } },
        update: {},
        create: { userId: existing.userId, badgeId: "" },
      }).catch(() => undefined);
      await awardBadges(existing.userId);
    }
    await prisma.auditLog.create({ data: { adminId: admin.id, action: "APPROVE", targetType: "contribution", targetId: existing.id, details: { questionId: question.id } } });
  } else {
    await prisma.auditLog.create({ data: { adminId: admin.id, action: "REJECT", targetType: "contribution", targetId: existing.id, details: { status: body.status } } });
  }
  res.json(ok(updated));
});

async function awardBadges(userId: string) {
  const approved = await prisma.contribution.count({ where: { userId, status: "APPROVED" } });
  const contributions = await prisma.contribution.count({ where: { userId } });
  const badges = await prisma.badge.findMany();
  const toAward = badges.filter((b) => {
    switch (b.slug) {
      case "first-question":
        return contributions >= 1;
      case "prolific-contributor":
        return contributions >= 50;
      case "question-master":
        return contributions >= 200;
      case "community-champion":
        return approved >= 50;
      default:
        return false;
    }
  });
  for (const b of toAward) {
    await prisma.userBadge.upsert({
      where: { userId_badgeId: { userId, badgeId: b.id } },
      update: {},
      create: { userId, badgeId: b.id },
    });
  }
}

contributionsRouter.delete("/:id", async (req, res) => {
  const admin = (req as unknown as AdminRequest).admin;
  const existing = await prisma.contribution.findUnique({ where: { id: req.params.id } });
  if (!existing) throw new AppError(404, "Contribution not found");
  await prisma.contribution.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({ data: { adminId: admin.id, action: "DELETE", targetType: "contribution", targetId: existing.id } });
  res.json(ok({ message: "Contribution deleted" }));
});
