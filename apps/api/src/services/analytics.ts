import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { cacheKeys, cacheGet, cacheSet } from "../lib/redis";

export type PublicStats = {
  categories: number;
  questions: number;
  sessions: number;
  moves: number;
  contributions: number;
  players: number;
  approvedQuestions: number;
};

export async function getPublicStats(): Promise<PublicStats> {
  const cached = await cacheGet<PublicStats>(cacheKeys.stats);
  if (cached) return cached;

  const [categories, questions, approvedQuestions, sessions, moves, contributions, players] = await Promise.all([
    prisma.category.count({ where: { status: "ACTIVE" } }),
    prisma.question.count({ where: { status: "APPROVED" } }),
    prisma.question.count({ where: { status: "APPROVED" } }),
    prisma.session.count(),
    prisma.gameMove.count(),
    prisma.contribution.count({ where: { status: "APPROVED" } }),
    prisma.user.count(),
  ]);

  const stats = { categories, questions, approvedQuestions, sessions, moves, contributions, players };
  await cacheSet(cacheKeys.stats, stats, 300);
  return stats;
}

export type DashboardStats = {
  totals: {
    users: number;
    categories: number;
    questions: number;
    pendingQuestions: number;
    approvedQuestions: number;
    rejectedQuestions: number;
    sessions: number;
    activeSessions: number;
    completedSessions: number;
    moves: number;
    contributions: number;
    pendingContributions: number;
    reports: number;
    openReports: number;
    categoryRequests: number;
    pendingCategoryRequests: number;
    contactMessages: number;
  };
  today: {
    questions: number;
    sessions: number;
    contributions: number;
    users: number;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    createdAt: string;
  }>;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [
    users, categories, questions, pendingQuestions, approvedQuestions, rejectedQuestions,
    sessions, activeSessions, completedSessions, moves, contributions, pendingContributions,
    reports, openReports, categoryRequests, pendingCategoryRequests, contactMessages,
    todayQuestions, todaySessions, todayContributions, todayUsers,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.category.count(),
    prisma.question.count(),
    prisma.question.count({ where: { status: "PENDING" } }),
    prisma.question.count({ where: { status: "APPROVED" } }),
    prisma.question.count({ where: { status: "REJECTED" } }),
    prisma.session.count(),
    prisma.session.count({ where: { status: { in: ["WAITING", "ACTIVE"] } } }),
    prisma.session.count({ where: { status: "COMPLETED" } }),
    prisma.gameMove.count(),
    prisma.contribution.count(),
    prisma.contribution.count({ where: { status: "PENDING" } }),
    prisma.questionReport.count(),
    prisma.questionReport.count({ where: { status: "OPEN" } }),
    prisma.categoryRequest.count(),
    prisma.categoryRequest.count({ where: { status: "PENDING" } }),
    prisma.contactMessage.count({ where: { status: "new" } }),
    prisma.question.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.session.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.contribution.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
  ]);

  const recentContributions = await prisma.contribution.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, question: true, status: true, createdAt: true },
  });
  const recentReports = await prisma.questionReport.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, ticket: true, reason: true, status: true, createdAt: true },
  });
  const recentRequests = await prisma.categoryRequest.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, status: true, createdAt: true },
  });

  const recentActivity = [
    ...recentContributions.map((c) => ({ id: c.id, type: "contribution", title: `Contribution: "${truncate(c.question, 60)}"`, createdAt: c.createdAt.toISOString() })),
    ...recentReports.map((r) => ({ id: r.id, type: "report", title: `${r.ticket} - ${r.reason}`, createdAt: r.createdAt.toISOString() })),
    ...recentRequests.map((r) => ({ id: r.id, type: "category-request", title: `Category request: ${r.name}`, createdAt: r.createdAt.toISOString() })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10);

  return {
    totals: {
      users, categories, questions, pendingQuestions, approvedQuestions, rejectedQuestions,
      sessions, activeSessions, completedSessions, moves, contributions, pendingContributions,
      reports, openReports, categoryRequests, pendingCategoryRequests, contactMessages,
    },
    today: { questions: todayQuestions, sessions: todaySessions, contributions: todayContributions, users: todayUsers },
    recentActivity,
  };
}

export type AnalyticsSeries = { date: string; questions: number; sessions: number; moves: number; contributions: number; users: number };

export async function getAnalyticsSeries(days = 30): Promise<AnalyticsSeries[]> {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const [questions, sessions, moves, contributions, users] = await Promise.all([
    prisma.question.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { createdAt: { gte: start } } }),
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { createdAt: { gte: start } } }),
    prisma.gameMove.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { createdAt: { gte: start } } }),
    prisma.contribution.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { createdAt: { gte: start } } }),
    prisma.user.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { createdAt: { gte: start } } }),
  ]);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const toMap = (rows: { createdAt: Date; _count: { _all: number } }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(dayKey(r.createdAt), (m.get(dayKey(r.createdAt)) ?? 0) + r._count._all);
    return m;
  };
  const qMap = toMap(questions as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const sMap = toMap(sessions as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const mMap = toMap(moves as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const cMap = toMap(contributions as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const uMap = toMap(users as unknown as { createdAt: Date; _count: { _all: number } }[]);

  const series: AnalyticsSeries[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = dayKey(d);
    series.push({
      date: key,
      questions: qMap.get(key) ?? 0,
      sessions: sMap.get(key) ?? 0,
      moves: mMap.get(key) ?? 0,
      contributions: cMap.get(key) ?? 0,
      users: uMap.get(key) ?? 0,
    });
  }
  return series;
}

export async function getTopCategories(limit = 10) {
  return prisma.category.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ playCount: "desc" }, { questionCount: "desc" }],
    take: limit,
    select: { id: true, name: true, slug: true, icon: true, color: true, playCount: true, questionCount: true },
  });
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ============================================================
// PHASE 10 — advanced analytics
// ============================================================

export function parseDateRange(from?: string, to?: string): { start: Date; end: Date } {
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(end.getTime())) throw new Error("Invalid or missing `to` date");
  end.setHours(23, 59, 59, 999);

  const start = from ? new Date(from) : new Date(end.getTime() - 29 * 86_400_000);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid `from` date");
  start.setHours(0, 0, 0, 0);
  if (start > end) throw new Error("`from` cannot be after `to`");
  return { start, end };
}

export function buildDaySeries(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

type CountRow = { createdAt: Date; _count: { _all: number } };

function countMap(rows: CountRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r.createdAt.toISOString().slice(0, 10);
    m.set(k, (m.get(k) ?? 0) + r._count._all);
  }
  return m;
}

export function countRowsByDay(rows: CountRow[]): Map<string, number> {
  return countMap(rows);
}

export type AdminAnalytics = {
  start: string;
  end: string;
  days: number;
  totals: Record<string, number>;
  series: AdminSeriesPoint[];
};

type AdminSeriesPoint = {
  date: string;
  users: number;
  questions: number;
  sessions: number;
  moves: number;
  contributions: number;
  reports: number;
  categoryRequests: number;
  messages: number;
  revenueLedger: number;
};

export async function getAdminAnalytics(from?: string, to?: string): Promise<AdminAnalytics> {
  const { start, end } = parseDateRange(from, to);
  const where = { createdAt: { gte: start, lte: end } };

  const [users, questions, sessions, moves, contributions, reports, categoryRequests, messages, revenue] = await Promise.all([
    prisma.user.groupBy({ by: ["createdAt"], _count: { _all: true }, where }),
    prisma.question.groupBy({ by: ["createdAt"], _count: { _all: true }, where }),
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where }),
    prisma.gameMove.groupBy({ by: ["createdAt"], _count: { _all: true }, where }),
    prisma.contribution.groupBy({ by: ["createdAt"], _count: { _all: true }, where }),
    prisma.questionReport.groupBy({ by: ["createdAt"], _count: { _all: true }, where }),
    prisma.categoryRequest.groupBy({ by: ["createdAt"], _count: { _all: true }, where }),
    prisma.messageLog.groupBy({ by: ["createdAt"], _count: { _all: true }, where }),
    prisma.revenueLedger.groupBy({ by: ["createdAt"], _count: { _all: true }, _sum: { revenueAmount: true, payoutAmount: true }, where }),
  ]);

  const maps = {
    users: countMap(users as CountRow[]),
    questions: countMap(questions as CountRow[]),
    sessions: countMap(sessions as CountRow[]),
    moves: countMap(moves as CountRow[]),
    contributions: countMap(contributions as CountRow[]),
    reports: countMap(reports as CountRow[]),
    categoryRequests: countMap(categoryRequests as CountRow[]),
    messages: countMap(messages as CountRow[]),
    revenueLedger: countMap(revenue as CountRow[]),
  };

  const days = buildDaySeries(start, end);
  const series: AdminSeriesPoint[] = days.map((day) => {
    const point: AdminSeriesPoint = {
      date: day,
      users: maps.users.get(day) ?? 0,
      questions: maps.questions.get(day) ?? 0,
      sessions: maps.sessions.get(day) ?? 0,
      moves: maps.moves.get(day) ?? 0,
      contributions: maps.contributions.get(day) ?? 0,
      reports: maps.reports.get(day) ?? 0,
      categoryRequests: maps.categoryRequests.get(day) ?? 0,
      messages: maps.messages.get(day) ?? 0,
      revenueLedger: maps.revenueLedger.get(day) ?? 0,
    };
    return point;
  });

  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  const totals: Record<string, number> = {
    users: sum(maps.users),
    questions: sum(maps.questions),
    sessions: sum(maps.sessions),
    moves: sum(maps.moves),
    contributions: sum(maps.contributions),
    reports: sum(maps.reports),
    categoryRequests: sum(maps.categoryRequests),
    messages: sum(maps.messages),
    revenueLedger: sum(maps.revenueLedger),
  };

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    days: days.length,
    totals,
    series,
  };
}

export type WhatsAppStats = {
  totals: {
    conversations: number;
    outbound: number;
    inbound: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    unknown: number;
    automated: number;
    manual: number;
  };
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  last7Days: { date: string; outbound: number; inbound: number }[];
};

export async function getWhatsAppStats(from?: string, to?: string): Promise<WhatsAppStats> {
  const { start, end } = parseDateRange(from, to);
  const where = { createdAt: { gte: start, lte: end } };

  const [byStatus, byType, byDay] = await Promise.all([
    prisma.messageLog.groupBy({ by: ["status"], _count: { _all: true }, where }),
    prisma.messageLog.groupBy({ by: ["type"], _count: { _all: true }, where }),
    prisma.messageLog.groupBy({ by: ["createdAt", "direction"], _count: { _all: true }, where }),
  ]);

  const statusMap = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
  const typeRows = byType.map((r) => ({ type: r.type, count: r._count._all })).sort((a, b) => b.count - a.count);

  const bar = new Map<string, { date: string; outbound: number; inbound: number }>();
  for (const r of byDay) {
    const k = r.createdAt.toISOString().slice(0, 10);
    const row = bar.get(k) ?? { date: k, outbound: 0, inbound: 0 };
    if (r.direction === "inbound") row.inbound += r._count._all;
    else row.outbound += r._count._all;
    bar.set(k, row);
  }
  const last7Days = buildDaySeries(start, end)
    .map((day) => bar.get(day) ?? { date: day, outbound: 0, inbound: 0 })
    .slice(-7);

  const conversations = await prisma.messageLog.findMany({ where, distinct: ["phone"], select: { phone: true } });
  const automated = await prisma.messageLog.count({ where: { ...where, metadata: { path: ["source"], not: "manual" } } });
  const manual = await prisma.messageLog.count({ where: { ...where, metadata: { path: ["source"], equals: "manual" } } });

  return {
    totals: {
      conversations: conversations.length,
      outbound: (statusMap["sent"] ?? 0) + (statusMap["delivered"] ?? 0) + (statusMap["read"] ?? 0) + (statusMap["failed"] ?? 0),
      inbound: byDay.filter((r) => r.direction === "inbound").reduce((a, r) => a + r._count._all, 0),
      sent: statusMap["sent"] ?? 0,
      delivered: statusMap["delivered"] ?? 0,
      read: statusMap["read"] ?? 0,
      failed: statusMap["failed"] ?? 0,
      unknown: statusMap["unknown"] ?? 0,
      automated,
      manual,
    },
    byType: typeRows,
    byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
    last7Days,
  };
}

export type AIStats = {
  totalChecked: number;
  aiAvailable: number;
  aiUnavailable: number;
  byClassification: { classification: string; count: number }[];
  duplicateFound: number;
  reviewRequired: number;
  averageScore: number;
  averageConfidence: number;
  byModel: { model: string | null; count: number }[];
  last7Days: { date: string; checked: number; duplicates: number }[];
};

export async function getAIStats(from?: string, to?: string): Promise<AIStats> {
  const { start, end } = parseDateRange(from, to);
  const where = { createdAt: { gte: start, lte: end }, aiResult: { not: Prisma.JsonNull } };

  const [rows] = await Promise.all([
    prisma.contribution.findMany({
      where,
      select: { aiResult: true, aiScore: true, createdAt: true },
    }),
  ]);

  let totalChecked = 0;
  let aiAvailable = 0;
  let aiUnavailable = 0;
  let duplicateFound = 0;
  let reviewRequired = 0;
  let scoreSum = 0;
  let scoreN = 0;
  let confSum = 0;
  let confN = 0;
  const classifications = new Map<string, number>();
  const models = new Map<string, number>();
  const byDay = new Map<string, { date: string; checked: number; duplicates: number }>();

  for (const r of rows) {
    totalChecked++;
    const ai = r.aiResult as unknown as {
      aiAvailable?: boolean;
      classification?: string;
      confidence?: number;
      score?: number;
      reviewRequired?: boolean;
      model?: string | null;
    } | null;
    const cls = ai?.classification ?? "UNKNOWN";
    if (ai?.aiAvailable) {
      aiAvailable++;
      if (ai.confidence !== undefined) { confSum += ai.confidence; confN++; }
    } else {
      aiUnavailable++;
    }
    classifications.set(cls, (classifications.get(cls) ?? 0) + 1);
    if (cls === "EXACT_DUPLICATE" || cls === "VERY_SIMILAR") duplicateFound++;
    if (ai?.reviewRequired) reviewRequired++;
    if (ai?.score !== undefined) { scoreSum += ai.score; scoreN++; }
    models.set(ai?.model ?? "none", (models.get(ai?.model ?? "none") ?? 0) + 1);

    const k = r.createdAt.toISOString().slice(0, 10);
    const row = byDay.get(k) ?? { date: k, checked: 0, duplicates: 0 };
    row.checked++;
    if (cls === "EXACT_DUPLICATE" || cls === "VERY_SIMILAR") row.duplicates++;
    byDay.set(k, row);
  }

  const last7Days = buildDaySeries(start, end).slice(-7).map((day) => byDay.get(day) ?? { date: day, checked: 0, duplicates: 0 });

  return {
    totalChecked,
    aiAvailable,
    aiUnavailable,
    byClassification: [...classifications.entries()].map(([classification, count]) => ({ classification, count })),
    duplicateFound,
    reviewRequired,
    averageScore: scoreN > 0 ? scoreSum / scoreN : 0,
    averageConfidence: confN > 0 ? confSum / confN : 0,
    byModel: [...models.entries()].map(([model, count]) => ({ model, count })),
    last7Days,
  };
}

export async function getCategoryAnalytics() {
  const [categories, groupByCategory, completedSessions] = await Promise.all([
    prisma.category.findMany({
      orderBy: [{ playCount: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        color: true,
        playCount: true,
        questionCount: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.session.groupBy({ by: ["categoryId"], _count: { _all: true }, where: { categoryId: { not: null } } }),
    prisma.session.findMany({ where: { status: "COMPLETED", categoryId: { not: null } }, select: { categoryId: true } }),
  ]);

  const sessionMap = new Map<string, number>();
  for (const r of groupByCategory) sessionMap.set(r.categoryId as string, r._count._all);
  const completedMap = new Map<string, number>();
  for (const s of completedSessions) completedMap.set(s.categoryId as string, (completedMap.get(s.categoryId as string) ?? 0) + 1);

  const avgTurns = Math.round((completedSessions.length / Math.max(1, categories.length)) * 10) / 10;

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    icon: c.icon,
    color: c.color,
    status: c.status,
    questionCount: c.questionCount,
    playCount: c.playCount,
    sessions: sessionMap.get(c.id) ?? 0,
    completedSessions: completedMap.get(c.id) ?? 0,
    avgTurns,
  }));
}

export async function getTopQuestions(limit = 10) {
  return prisma.question.findMany({
    where: { status: "APPROVED" },
    orderBy: [{ playsCount: "desc" }, { reportCount: "asc" }],
    take: limit,
    select: {
      id: true,
      text: true,
      type: true,
      playsCount: true,
      reportCount: true,
      difficulty: true,
      aiScore: true,
      createdAt: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  });
}
