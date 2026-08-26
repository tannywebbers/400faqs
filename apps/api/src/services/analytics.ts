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
    ads: number;
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
    reports, openReports, categoryRequests, pendingCategoryRequests, contactMessages, ads,
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
    prisma.ad.count({ where: { status: true } }),
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
      reports, openReports, categoryRequests, pendingCategoryRequests, contactMessages, ads,
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
