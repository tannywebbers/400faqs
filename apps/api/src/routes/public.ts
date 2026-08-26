import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { validate, parsePagination } from "../middleware/validate";
import { publicLimiter, contributionLimiter } from "../middleware/rateLimit";
import { ok } from "../lib/response";
import { getPublicSettings } from "../services/settings";
import { getPublicStats } from "../services/analytics";
import { getSystemStatus } from "../services/status";
import { getLeaderboard } from "../services/leaderboard";
import { submitContribution } from "../services/moderation";
import { generateTicket } from "../lib/ticket";
import { slugify } from "../lib/slugify";
import { notifyAdmins } from "../services/notifications";
import { upload, processImage, uploadedUrl, saveUploadRecord } from "../lib/upload";
import { AppError } from "../lib/response";
import { QuestionType } from "@prisma/client";

export const publicRouter = Router();

publicRouter.get("/status", async (_req, res) => {
  res.json(ok(await getSystemStatus()));
});

publicRouter.get("/settings", async (_req, res) => {
  res.json(ok(await getPublicSettings()));
});

publicRouter.get("/stats", async (_req, res) => {
  res.json(ok(await getPublicStats()));
});

// ============================================================
// Categories
// ============================================================

const categorySorts = ["newest", "most_played", "most_questions", "trending", "alphabetical"] as const;

publicRouter.get("/categories", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const sort = categorySorts.includes(req.query.sort as (typeof categorySorts)[number]) ? (req.query.sort as (typeof categorySorts)[number]) : "newest";
  const type = req.query.type as string | undefined;

  const where: Record<string, unknown> = { status: "ACTIVE" };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  if (type === "trending") where.trending = true;

  const orderBy = (() => {
    switch (sort) {
      case "most_played":
        return [{ playCount: "desc" as const }];
      case "most_questions":
        return [{ questionCount: "desc" as const }];
      case "trending":
        return [{ trending: "desc" as const }, { playCount: "desc" as const }];
      case "alphabetical":
        return [{ name: "asc" as const }];
      default:
        return [{ createdAt: "desc" as const }];
    }
  })();

  const [total, items] = await Promise.all([
    prisma.category.count({ where }),
    prisma.category.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: { _count: { select: { questions: true, contributions: true, sessions: true } }, createdBy: { select: { name: true } } },
    }),
  ]);

  res.json(
    ok(
      items.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        icon: c.icon,
        color: c.color,
        questionCount: c._count.questions,
        contributionCount: c._count.contributions,
        playCount: c.playCount,
        trending: c.trending,
        createdAt: c.createdAt,
        createdByName: c.createdBy?.name ?? "400QUES Team",
      })),
      { page, limit, total, totalPages: Math.ceil(total / limit) }
    )
  );
});

publicRouter.get("/categories/:slug", async (req, res) => {
  const category = await prisma.category.findFirst({
    where: { slug: req.params.slug, status: "ACTIVE" },
    include: {
      createdBy: { select: { name: true } },
      questions: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, text: true, type: true, createdAt: true } },
      contributions: { where: { status: "APPROVED" }, distinct: ["userId"], select: { userId: true } },
    },
  });
  if (!category) throw new AppError(404, "Category not found");

  const contributorCount = (category.contributions as { userId: string | null }[]).filter((c) => c.userId).length;
  const reportCount = await prisma.questionReport.count({ where: { categoryId: category.id } });

  res.json(
    ok({
      ...category,
      contributorCount,
      reportCount,
      recentlyAdded: category.questions,
    })
  );
});

// ============================================================
// Content
// ============================================================

publicRouter.get("/faqs", async (_req, res) => {
  const faqs = await prisma.faq.findMany({ where: { status: true }, orderBy: { order: "asc" } });
  res.json(ok(faqs));
});

publicRouter.get("/help-articles", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const q = String(req.query.q ?? "").trim();
  const category = req.query.category as string | undefined;

  const where: Record<string, unknown> = { status: true };
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }];
  if (category) where.category = category;

  const [total, items] = await Promise.all([
    prisma.helpArticle.count({ where }),
    prisma.helpArticle.findMany({ where, orderBy: { order: "asc" }, skip, take: limit, select: { id: true, title: true, slug: true, excerpt: true, category: true, updatedAt: true } }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

publicRouter.get("/help-articles/categories", async (_req, res) => {
  const rows = await prisma.helpArticle.findMany({ where: { status: true }, select: { category: true }, distinct: ["category"] });
  res.json(ok(rows.map((r) => r.category)));
});

publicRouter.get("/help-articles/:slug", async (req, res) => {
  const article = await prisma.helpArticle.findFirst({ where: { slug: req.params.slug, status: true } });
  if (!article) throw new AppError(404, "Article not found");
  res.json(ok(article));
});

// ============================================================
// Contributions
// ============================================================

const contributionSchema = z.object({
  body: z.object({
    userPhone: z.string().min(8).max(20),
    categoryId: z.string().min(1),
    question: z.string().min(3).max(300),
    type: z.enum(["TRUTH", "DARE", "NORMAL"]).optional(),
  }),
});

publicRouter.post("/contributions", contributionLimiter, validate(contributionSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof contributionSchema.shape.body> } }).validated.body;
  const category = await prisma.category.findFirst({ where: { id: body.categoryId, status: "ACTIVE" } });
  if (!category) throw new AppError(400, "Category not found");

  const user = await prisma.user.findUnique({ where: { phone: body.userPhone } });
  const outcome = await submitContribution({
    userPhone: body.userPhone,
    userId: user?.id,
    categoryId: body.categoryId,
    question: body.question,
    type: body.type as QuestionType | undefined,
  });
  res.json(ok(outcome));
});

publicRouter.get("/contributions/:ticket", async (req, res) => {
  const contribution = await prisma.contribution.findUnique({
    where: { ticket: req.params.ticket },
    select: { ticket: true, status: true, question: true, aiScore: true, rejectionReason: true, createdAt: true },
  });
  if (!contribution) throw new AppError(404, "Submission not found");
  res.json(ok(contribution));
});

// ============================================================
// Reports
// ============================================================

const reportSchema = z.object({
  body: z.object({
    reporterPhone: z.string().min(8).max(20),
    categorySlug: z.string().min(1),
    questionNumber: z.string().optional(),
    reason: z.enum(["DUPLICATE", "WRONG_ANSWER", "INAPPROPRIATE", "SPAM", "OFF_TOPIC", "OTHER"]),
    notes: z.string().max(1000).optional(),
    questionText: z.string().max(500).optional(),
  }),
});

publicRouter.post("/reports", contributionLimiter, upload.single("screenshot"), validate(reportSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof reportSchema.shape.body> } }).validated.body;
  const category = await prisma.category.findFirst({ where: { slug: body.categorySlug, status: "ACTIVE" } });
  if (!category) throw new AppError(400, "Category not found");

  let question = null;
  if (body.questionNumber) {
    question = await prisma.question.findFirst({ where: { categoryId: category.id, id: body.questionNumber } });
  } else if (body.questionText) {
    question = await prisma.question.findFirst({ where: { categoryId: category.id, text: { contains: body.questionText, mode: "insensitive" } } });
  }

  let screenshotUrl: string | null = null;
  if (req.file) {
    await processImage(req.file.path);
    screenshotUrl = uploadedUrl(req, req.file.filename);
    await saveUploadRecord(screenshotUrl, req.file.mimetype, req.file.size, body.reporterPhone);
  }

  const ticket = generateTicket("RPT");
  const report = await prisma.questionReport.create({
    data: {
      ticket,
      categoryId: category.id,
      questionId: question?.id ?? null,
      reporterPhone: body.reporterPhone,
      reason: body.reason,
      notes: body.notes ?? body.questionText,
      screenshotUrl,
    },
  });
  if (question) {
    await prisma.question.update({ where: { id: question.id }, data: { reportCount: { increment: 1 } } });
  }

  await notifyAdmins({
    type: "REPORT",
    title: "New question report",
    message: `${ticket} — ${body.reason}${question ? ` on "${question.text.slice(0, 60)}"` : ""}`,
    link: `/admin/reports?ticket=${ticket}`,
  });

  res.json(ok({ ticket: report.ticket, status: report.status, message: "Report submitted. Our team will review it shortly." }));
});

publicRouter.get("/reports/:ticket", async (req, res) => {
  const report = await prisma.questionReport.findUnique({
    where: { ticket: req.params.ticket },
    select: { ticket: true, status: true, reason: true, notes: true, createdAt: true, resolution: true, resolvedAt: true },
  });
  if (!report) throw new AppError(404, "Report not found");
  res.json(ok(report));
});

// ============================================================
// Category requests
// ============================================================

const categoryRequestSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(60),
    description: z.string().min(10).max(500),
    examples: z.string().max(1000).optional(),
    reason: z.string().max(500).optional(),
    requestorPhone: z.string().min(8).max(20),
  }),
});

publicRouter.post("/category-requests", contributionLimiter, validate(categoryRequestSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof categoryRequestSchema.shape.body> } }).validated.body;
  const slug = slugify(body.name);
  const existing = await prisma.category.findFirst({ where: { OR: [{ slug }, { name: { equals: body.name, mode: "insensitive" } }] } });
  if (existing) throw new AppError(409, "A category with this name already exists.");

  const reqRow = await prisma.categoryRequest.create({
    data: {
      name: body.name,
      description: body.description,
      examples: body.examples,
      reason: body.reason,
      requestorPhone: body.requestorPhone,
    },
  });
  await notifyAdmins({
    type: "CATEGORY_REQ",
    title: "New category request",
    message: `${body.name} — ${body.description.slice(0, 80)}`,
    link: `/admin/category-requests?id=${reqRow.id}`,
  });
  res.json(ok({ id: reqRow.id, status: reqRow.status, message: "Category request received." }));
});

publicRouter.get("/category-requests/:id", async (req, res) => {
  const row = await prisma.categoryRequest.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, description: true, examples: true, reason: true, status: true, note: true, createdAt: true, updatedAt: true },
  });
  if (!row) throw new AppError(404, "Request not found");
  res.json(ok(row));
});

// ============================================================
// Leaderboard / Search / Contact / Ads
// ============================================================

publicRouter.get("/leaderboard", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  res.json(ok(await getLeaderboard(limit)));
});

publicRouter.get("/top-contributors", async (req, res) => {
  const rows = await prisma.contribution.groupBy({
    by: ["userPhone"],
    where: { status: "APPROVED" },
    _count: { _all: true },
  });
  const sorted = rows
    .map((r) => ({ phone: r.userPhone.replace(/^(\d{3})\d+(\d{2})$/, "$1*****$2"), approved: r._count._all }))
    .sort((a, b) => b.approved - a.approved)
    .slice(0, 10);
  res.json(ok(sorted));
});

publicRouter.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json(ok({ categories: [], questions: [], articles: [] }));
  const [categories, questions, articles] = await Promise.all([
    prisma.category.findMany({ where: { status: "ACTIVE", name: { contains: q, mode: "insensitive" } }, take: 6, select: { id: true, name: true, slug: true, icon: true, color: true, questionCount: true } }),
    prisma.question.findMany({ where: { status: "APPROVED", text: { contains: q, mode: "insensitive" } }, take: 6, select: { id: true, text: true, type: true, category: { select: { slug: true, name: true } } } }),
    prisma.helpArticle.findMany({ where: { status: true, OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] }, take: 6, select: { id: true, title: true, slug: true, category: true } }),
  ]);
  res.json(ok({ categories, questions, articles }));
});

const contactSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    subject: z.string().min(3).max(200),
    message: z.string().min(10).max(3000),
  }),
});

publicRouter.post("/contact", publicLimiter, validate(contactSchema), async (req, res) => {
  const body = (req as unknown as { validated: { body: z.infer<typeof contactSchema.shape.body> } }).validated.body;
  await prisma.contactMessage.create({ data: body });
  await notifyAdmins({
    type: "CONTRIBUTION",
    title: "New contact message",
    message: `${body.name} — ${body.subject}`,
    link: "/admin/contact",
  });
  res.json(ok({ message: "Message received. We'll get back to you soon." }));
});

publicRouter.get("/ads", async (req, res) => {
  const placement = req.query.placement as string | undefined;
  const now = new Date();
  const ads = await prisma.ad.findMany({
    where: {
      status: true,
      ...(placement ? { placement: placement as "HERO" | "SIDEBAR" | "INLINE" } : {}),
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
    },
    orderBy: { order: "asc" },
    select: { id: true, title: true, subtitle: true, imageUrl: true, linkUrl: true, placement: true },
  });
  res.json(ok(ads));
});

publicRouter.post("/ads/:id/click", async (req, res) => {
  await prisma.ad.update({ where: { id: req.params.id }, data: { clicks: { increment: 1 } } });
  res.json(ok({ message: "ok" }));
});

publicRouter.post("/uploads", publicLimiter, upload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "No file uploaded");
  await processImage(req.file.path);
  const url = uploadedUrl(req, req.file.filename);
  await saveUploadRecord(url, req.file.mimetype, req.file.size);
  res.json(ok({ url }));
});
