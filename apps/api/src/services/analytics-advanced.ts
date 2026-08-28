import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { parseDateRange, buildDaySeries, countRowsByDay, getTopQuestions, getTopCategories } from "./analytics";
import { getAllSettings, settingsToRecord, settingBool } from "./settings";
import { getRevenueSettings } from "./revenue";

// ============================================================
// ADVANCED ADMIN ANALYTICS  (Phase 11)
//
// Every endpoint in apps/api/src/routes/admin/analytics.ts that
// starts with /overview /users /sessions /categories /questions
// /contributions /ai /whatsapp /monetization /revenue /timeseries
// /top is backed by this service.
//
// Design constraints:
//   - Database-side aggregation (groupBy + count), never whole-table
//     loads, except for bounded joined breakdowns (provider/snippet/
//     category monetization) with hard caps and page limits.
//   - ESTIMATED revenue is always derived from real activity x
//     admin-entered provider rates and is clearly labelled; it is
//     NEVER fabricated and NEVER written automatically.
//   - No Google-AI cost/token counting: we have no usage feed, so the
//     UI shows "AI COST DATA NOT AVAILABLE" instead of a fake number.
// ============================================================

export type Range = {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  days: number;
  startKey: string;
  endKey: string;
};

export function resolveRange(from?: string, to?: string): Range {
  const { start, end } = parseDateRange(from, to);
  const spanMs = Math.max(0, end.getTime() - start.getTime());
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(start.getTime() - spanMs - 1);
  prevEnd.setHours(23, 59, 59, 999);
  prevStart.setHours(0, 0, 0, 0);
  return {
    start,
    end,
    prevStart,
    prevEnd,
    days: Math.max(1, Math.round(spanMs / 86_400_000)),
    startKey: start.toISOString().slice(0, 10),
    endKey: end.toISOString().slice(0, 10),
  };
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length <= 6) return phone;
  return `${phone.slice(0, 3)}*****${phone.slice(-2)}`;
}

export type Trend = { value: number; previous: number; changePct: number | null; direction: "up" | "down" | "flat" };

function trend(current: number, previous: number): Trend {
  return {
    value: current,
    previous,
    changePct: previous === 0 ? (current === 0 ? 0 : null) : Math.round(((current - previous) / previous) * 1000) / 10,
    direction: current > previous ? "up" : current < previous ? "down" : "flat",
  };
}

const inRange = (r: Range) => ({ createdAt: { gte: r.start, lte: r.end } });

// ============================================================
// OVERVIEW
// ============================================================

type OverviewBag = {
  users: number;
  activeUsers: number;
  newUsers: number;
  sessions: number;
  completedSessions: number;
  abandonedSessions: number;
  expiredSessions: number;
  questionsAsked: number;
  questionsAnswered: number;
  moves: number;
  contributions: number;
  approvedContributions: number;
  reportedQuestions: number;
  verifiedGates: number;
  totalGates: number;
  avgSessionSeconds: number;
  avgRoundsPerSession: number;
};

async function overviewBag(r: { start: Date; end: Date }): Promise<OverviewBag> {
  const started = { createdAt: { gte: r.start, lte: r.end } } as const;
  const completedWhere = { status: "COMPLETED", startedAt: { not: null, gte: r.start }, finishedAt: { not: null, lte: r.end } } as const;
  const [users, activeUsers, sessions, completed, abandoned, expired, questionsAsked, questionsAnswered, moves, contributions, approved, reported, gatesAgg] =
    await Promise.all([
      prisma.user.count({ where: started }),
      prisma.user.count({ where: { lastSeenAt: { gte: r.start, lte: r.end } } }),
      prisma.session.count({ where: started }),
      prisma.session.count({ where: completedWhere }),
      prisma.session.count({ where: { status: "ABANDONED", ...started } }),
      prisma.session.count({ where: { state: "EXPIRED", ...started } }),
      prisma.gameMove.count({ where: started }),
      prisma.gameMove.count({ where: { answeredAt: { not: null, gte: r.start, lte: r.end } } }),
      prisma.gameMove.count({ where: started }),
      prisma.contribution.count({ where: started }),
      prisma.contribution.count({ where: { status: "APPROVED", ...started } }),
      prisma.questionReport.count({ where: started }),
      prisma.monetizationGate.groupBy({ by: ["status"], _count: { _all: true }, where: started }),
    ]);

  const gateMap = new Map(gatesAgg.map((g) => [g.status, g._count._all]));
  const totalGates = (gateMap.get("PENDING") ?? 0) + (gateMap.get("VERIFIED") ?? 0) + (gateMap.get("EXPIRED") ?? 0) + (gateMap.get("FAILED") ?? 0) + (gateMap.get("CANCELLED") ?? 0);
  const verifiedGates = gateMap.get("VERIFIED") ?? 0;

  const completedSessions = await prisma.session.findMany({
    where: { status: "COMPLETED", startedAt: { not: null }, finishedAt: { not: null }, createdAt: { gte: r.start, lte: r.end } },
    select: { startedAt: true, finishedAt: true, turnsPlayed: true },
    take: 5000,
  });
  const durations = completedSessions.filter((s) => s.startedAt && s.finishedAt);
  const avgSessionSeconds = durations.length
    ? Math.round(durations.reduce((acc, s) => acc + (s.finishedAt!.getTime() - s.startedAt!.getTime()) / 1000, 0) / durations.length * 10) / 10
    : 0;
  const avgRoundsPerSession = durations.length
    ? Math.round((durations.reduce((acc, s) => acc + s.turnsPlayed, 0) / durations.length) * 10) / 10
    : 0;

  return {
    users,
    activeUsers,
    newUsers: users,
    sessions,
    completedSessions: completed,
    abandonedSessions: abandoned,
    expiredSessions: expired,
    questionsAsked,
    questionsAnswered,
    moves,
    contributions,
    approvedContributions: approved,
    reportedQuestions: reported,
    verifiedGates,
    totalGates,
    avgSessionSeconds,
    avgRoundsPerSession,
  };
}

export type OverviewResponse = {
  range: { start: string; end: string; days: number };
  kpis: Record<string, Trend>;
  categories: { active: number; total: number };
};

export async function getAnalyticsOverview(from?: string, to?: string): Promise<OverviewResponse> {
  const r = resolveRange(from, to);
  const [cur, prev] = await Promise.all([overviewBag(r), overviewBag({ start: r.prevStart, end: r.prevEnd })]);
  const [activeCategories, totalCategories] = await Promise.all([
    prisma.category.count({ where: { status: "ACTIVE" } }),
    prisma.category.count(),
  ]);

  const k = (label: string, a: number, b: number): [string, Trend] => [label, trend(a, b)];
  const success = cur.totalGates ? (cur.verifiedGates / cur.totalGates) * 100 : 0;
  const prevSuccess = prev.totalGates ? (prev.verifiedGates / prev.totalGates) * 100 : 0;

  return {
    range: { start: r.startKey, end: r.endKey, days: r.days },
    categories: { active: activeCategories, total: totalCategories },
    kpis: Object.fromEntries([
      k("totalUsers", cur.users, prev.users),
      k("activeUsers", cur.activeUsers, prev.activeUsers),
      k("newUsers", cur.newUsers, prev.newUsers),
      k("totalSessions", cur.sessions, prev.sessions),
      k("completedSessions", cur.completedSessions, prev.completedSessions),
      k("abandonedSessions", cur.abandonedSessions, prev.abandonedSessions),
      k("expiredSessions", cur.expiredSessions, prev.expiredSessions),
      k("questionsAsked", cur.questionsAsked, prev.questionsAsked),
      k("questionsAnswered", cur.questionsAnswered, prev.questionsAnswered),
      k("totalMoves", cur.moves, prev.moves),
      k("verificationGates", cur.totalGates, prev.totalGates),
      k("verificationSuccessRate", success, prevSuccess),
      k("contributions", cur.contributions, prev.contributions),
      k("approvedContributions", cur.approvedContributions, prev.approvedContributions),
      k("reportedQuestions", cur.reportedQuestions, prev.reportedQuestions),
      k("avgSessionSeconds", cur.avgSessionSeconds, prev.avgSessionSeconds),
      k("avgRoundsPerSession", cur.avgRoundsPerSession, prev.avgRoundsPerSession),
    ]),
  };
}

// ============================================================
// USERS
// ============================================================

export type UserAnalyticsResponse = {
  range: Range;
  totals: { totalUsers: number; newUsers: number; activeUsers: number; returningUsers: number; usersInSessions: number; usersContributing: number; usersReporting: number; usersRequesting: number };
  series: { date: string; newUsers: number; activeUsers: number; returning: number }[];
  platforms: { new: number; returning: number };
  top: {
    mostActive: { userId: string; phone: string; name: string | null; moves: number }[];
    topContributors: { userId: string | null; phone: string; name: string | null; count: number }[];
    mostAnswered: { userId: string; phone: string; name: string | null; answered: number }[];
    mostSessions: { userId: string; phone: string; name: string | null; sessions: number }[];
  };
};

export async function getUserAnalytics(from?: string, to?: string): Promise<UserAnalyticsResponse> {
  const r = resolveRange(from, to);
  const started = inRange(r);
  const [totalUsers, newUsers, activeUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: started }),
    prisma.user.count({ where: { lastSeenAt: { gte: r.start, lte: r.end } } }),
  ]);
  const returning = await prisma.user.count({ where: { firstSeenAt: { lt: r.start }, lastSeenAt: { gte: r.start, lte: r.end } } });

  const [sessionRows, moveRows, contributionRows, reportRows, requestRows] = await Promise.all([
    prisma.session.findMany({ where: { ...started }, select: { creatorId: true, joinerId: true }, take: 20000 }),
    prisma.gameMove.findMany({ where: started, select: { askedBy: true, answeredBy: true }, take: 20000 }),
    prisma.contribution.findMany({ where: started, select: { userId: true, userPhone: true }, take: 20000 }),
    prisma.questionReport.findMany({ where: started, select: { reporterId: true }, take: 10000 }),
    prisma.categoryRequest.findMany({ where: started, select: { requestorId: true }, take: 10000 }),
  ]);

  const userSet = new Set<string>();
  for (const s of sessionRows) {
    if (s.creatorId) userSet.add(s.creatorId);
    if (s.joinerId) userSet.add(s.joinerId);
  }

  const newUsersPerDay = await prisma.user.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started });
  const movesPerDay = await prisma.gameMove.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started });
  const activeDayMap = countRowsByDay(movesPerDay as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const newDayMap = countRowsByDay(newUsersPerDay as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const days = buildDaySeries(r.start, r.end);
  const series = days.map((date) => ({
    date,
    newUsers: newDayMap.get(date) ?? 0,
    activeUsers: activeDayMap.get(date) ?? 0,
    returning: 0,
  }));

  // Most active players (by moves)
  const askedBy = new Map<string, number>();
  const answeredBy = new Map<string, number>();
  for (const m of moveRows) {
    askedBy.set(m.askedBy, (askedBy.get(m.askedBy) ?? 0) + 1);
    answeredBy.set(m.answeredBy, (answeredBy.get(m.answeredBy) ?? 0) + 1);
  }
  const playerIds = Array.from(new Set([...askedBy.keys(), ...answeredBy.keys()]));
  const topActiveIds = Array.from(askedBy.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id);
  const topAnsweredIds = Array.from(answeredBy.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id);

  // Top contributors
  const contribByUser = new Map<string, number>();
  const contribPhone = new Map<string, string>();
  for (const c of contributionRows) {
    if (c.userId) {
      contribByUser.set(c.userId, (contribByUser.get(c.userId) ?? 0) + 1);
      contribPhone.set(c.userId, c.userPhone);
    }
  }
  const topContributorIds = Array.from(contribByUser.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id);

  // Most sessions participated
  const sessionCount = new Map<string, number>();
  for (const s of sessionRows) {
    if (s.creatorId) sessionCount.set(s.creatorId, (sessionCount.get(s.creatorId) ?? 0) + 1);
    if (s.joinerId) sessionCount.set(s.joinerId, (sessionCount.get(s.joinerId) ?? 0) + 1);
  }
  const topSessionIds = Array.from(sessionCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id);

  const wantedIds = new Set([...topActiveIds, ...topAnsweredIds, ...topContributorIds, ...topSessionIds]);
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(wantedIds) } },
    select: { id: true, phone: true, name: true, displayName: true },
    take: 100,
  });
  const userMap = new Map(users.map((u) => [u.id, { phone: maskPhone(u.phone), name: u.displayName ?? u.name ?? null }]));

  const mapTop = (ids: string[], score: Map<string, number>) =>
    ids
      .map((id) => {
        const meta = userMap.get(id);
        return { userId: id, phone: meta?.phone ?? "", name: meta?.name ?? null, moves: score.get(id) ?? 0 };
      })
      .filter((x) => x.phone);

  const usersContributing = new Set(contribByUser.keys()).size;
  const usersReporting = new Set(reportRows.filter((x) => x.reporterId).map((x) => x.reporterId as string)).size;
  const usersRequesting = new Set(requestRows.filter((x) => x.requestorId).map((x) => x.requestorId as string)).size;

  return {
    range: r,
    totals: {
      totalUsers,
      newUsers,
      activeUsers,
      returningUsers: returning,
      usersInSessions: userSet.size,
      usersContributing,
      usersReporting,
      usersRequesting,
    },
    series,
    platforms: { new: newUsers, returning },
    top: {
      mostActive: mapTop(topActiveIds, askedBy),
      topContributors: topContributorIds
        .map((id) => {
          const meta = userMap.get(id);
          return { userId: id, phone: meta?.phone ?? "", name: meta?.name ?? null, count: contribByUser.get(id) ?? 0 };
        })
        .filter((x) => x.phone),
      mostAnswered: Array.from(answeredBy.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id, n]) => {
          const meta = userMap.get(id);
          return { userId: id, phone: meta?.phone ?? "", name: meta?.name ?? null, answered: n };
        })
        .filter((x) => x.phone),
      mostSessions: Array.from(sessionCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([id, n]) => {
          const meta = userMap.get(id);
          return { userId: id, phone: meta?.phone ?? "", name: meta?.name ?? null, sessions: n };
        })
        .filter((x) => x.phone),
    },
  };
}

// ============================================================
// SESSIONS
// ============================================================

export type SessionAnalyticsResponse = {
  range: Range;
  totals: {
    created: number;
    joined: number;
    completed: number;
    cancelled: number;
    expired: number;
    abandoned: number;
    activeNow: number;
    completionRate: number;
    abandonmentRate: number;
    avgDurationSeconds: number;
    avgMoves: number;
    avgQuestionsPerSession: number;
  };
  series: { date: string; created: number; completed: number; abandoned: number }[];
  byCategory: { categoryId: string | null; name: string; count: number }[];
  byGameType: { gameType: string; count: number }[];
};

export async function getSessionAnalytics(from?: string, to?: string): Promise<SessionAnalyticsResponse> {
  const r = resolveRange(from, to);
  const started = inRange(r);
  const [created, joined, completed, cancelled, expired, abandoned, activeNow, groupByCat] = await Promise.all([
    prisma.session.count({ where: started }),
    prisma.session.count({ where: { ...started, joinerId: { not: null } } }),
    prisma.session.count({ where: { status: "COMPLETED", ...started } }),
    prisma.session.count({ where: { leaverId: { not: null }, ...started } }),
    prisma.session.count({ where: { state: "EXPIRED", ...started } }),
    prisma.session.count({ where: { status: "ABANDONED", ...started } }),
    prisma.session.count({ where: { status: { in: ["WAITING", "ACTIVE"] } } }),
    prisma.session.groupBy({ by: ["categoryId"], _count: { _all: true }, where: { ...started, categoryId: { not: null } } }),
  ]);

  const completedRows = await prisma.session.findMany({
    where: { status: "COMPLETED", startedAt: { not: null }, finishedAt: { not: null }, createdAt: { gte: r.start, lte: r.end } },
    select: { startedAt: true, finishedAt: true, turnsPlayed: true },
    take: 5000,
  });
  const durations = completedRows.filter((s) => s.startedAt && s.finishedAt);
  const avgDurationSeconds = durations.length
    ? Math.round((durations.reduce((acc, s) => acc + (s.finishedAt!.getTime() - s.startedAt!.getTime()) / 1000, 0) / durations.length) * 10) / 10
    : 0;
  const avgMoves = completedRows.length ? Math.round((completedRows.reduce((acc, s) => acc + s.turnsPlayed, 0) / completedRows.length) * 10) / 10 : 0;
  const avgQuestionsPerSession = avgMoves;

  const [seriesCreated, seriesCompleted, seriesAbandoned] = await Promise.all([
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { status: "COMPLETED", ...started } }),
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { status: "ABANDONED", ...started } }),
  ]);
  const cMap = countRowsByDay(seriesCreated as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const compMap = countRowsByDay(seriesCompleted as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const abdMap = countRowsByDay(seriesAbandoned as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const series = buildDaySeries(r.start, r.end).map((date) => ({ date, created: cMap.get(date) ?? 0, completed: compMap.get(date) ?? 0, abandoned: abdMap.get(date) ?? 0 }));

  const catRows = prisma.session.groupBy({ by: ["categoryId"], _count: { _all: true }, where: { ...started, categoryId: { not: null } } }).then((rows) => rows as { categoryId: string; _count: { _all: number } }[]);
  let byCategory: { categoryId: string | null; name: string; count: number }[] = [];
  let byGameType: { gameType: string; count: number }[] = [];
  void groupByCat;
  void catRows;

  const catList = await catRows;
  const catIds = catList.map((x) => x.categoryId).filter((x): x is string => Boolean(x));
  const cats = catIds.length ? await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true, gameType: true } }) : [];
  const catMap = new Map(cats.map((c) => [c.id, c]));
  byCategory = catList.map((row) => ({ categoryId: row.categoryId, name: catMap.get(row.categoryId)?.name ?? "Unknown", count: row._count._all }));
  byCategory.sort((a, b) => b.count - a.count);
  byCategory = byCategory.slice(0, 100);
  const typeMap = new Map<string, number>();
  for (const row of catList) {
    const t = catMap.get(row.categoryId)?.gameType ?? "NORMAL";
    typeMap.set(t, (typeMap.get(t) ?? 0) + row._count._all);
  }
  byGameType = Array.from(typeMap.entries()).map(([gameType, count]) => ({ gameType, count })).sort((a, b) => b.count - a.count);

  return {
    range: r,
    totals: {
      created,
      joined,
      completed,
      cancelled,
      expired,
      abandoned,
      activeNow,
      completionRate: created ? Math.round((completed / created) * 1000) / 10 : 0,
      abandonmentRate: created ? Math.round((abandoned / created) * 1000) / 10 : 0,
      avgDurationSeconds,
      avgMoves,
      avgQuestionsPerSession,
    },
    series,
    byCategory,
    byGameType,
  };
}

// ============================================================
// CATEGORY RANKINGS
// ============================================================

export type CategoryRanking = {
  id: string;
  name: string;
  slug: string;
  color: string;
  status: string;
  sessions: number;
  players: number;
  questionsAsked: number;
  contributions: number;
  reports: number;
  gates: number;
  verifiedGates: number;
  verificationRate: number;
  estimatedRevenue: number;
  playCount: number;
  questionCount: number;
};

export async function getCategoryRankings(): Promise<CategoryRanking[]> {
  const catList = await prisma.category.findMany({
    orderBy: [{ playCount: "desc" }],
    take: 200,
    select: { id: true, name: true, slug: true, color: true, status: true, gameType: true, playCount: true, questionCount: true },
  });
  if (catList.length === 0) return [];
  const catIds = catList.map((c) => c.id);
  const idSet = new Set(catIds);

  // Sessions + distinct players, capped to the top categories by volume.
  const sessionRows = await prisma.session.findMany({
    where: { categoryId: { in: catIds } },
    select: { id: true, categoryId: true, creatorId: true, joinerId: true },
    take: 50000,
    orderBy: { createdAt: "desc" },
  });
  const sessionByCat = new Map<string, string[]>();
  const playersByCat = new Map<string, Set<string>>();
  for (const s of sessionRows) {
    const cat = s.categoryId;
    if (!cat) continue;
    sessionByCat.set(cat, [...(sessionByCat.get(cat) ?? []), s.id]);
    const set = playersByCat.get(cat) ?? new Set<string>();
    if (s.creatorId) set.add(s.creatorId);
    if (s.joinerId) set.add(s.joinerId);
    playersByCat.set(cat, set);
  }

  const [contribGroup, reportGroup, gateGroup, ledgerGroup, moveGroup] = await Promise.all([
    prisma.contribution.groupBy({ by: ["categoryId"], _count: { _all: true }, where: { categoryId: { in: catIds } } }),
    prisma.questionReport.groupBy({ by: ["categoryId"], _count: { _all: true }, where: { categoryId: { in: catIds } } }),
    prisma.monetizationGate.groupBy({ by: ["sessionId", "status"], _count: { _all: true }, where: { sessionId: { in: sessionRows.map((s) => s.id) } } }),
    prisma.revenueLedger.groupBy({ by: ["sessionId"], _sum: { revenueAmount: true }, where: { sessionId: { in: sessionRows.map((s) => s.id) } } }),
    prisma.gameMove.groupBy({ by: ["sessionId"], _count: { _all: true }, where: { sessionId: { in: sessionRows.map((s) => s.id) } } }),
  ]);

  const sessionToCat = new Map<string, string>();
  for (const s of sessionRows) if (s.categoryId) sessionToCat.set(s.id, s.categoryId);

  const gateCounts = new Map<string, { total: number; verified: number }>();
  for (const g of gateGroup) {
    const cat = sessionToCat.get(g.sessionId);
    if (!cat) continue;
    const cur = gateCounts.get(cat) ?? { total: 0, verified: 0 };
    cur.total += g._count._all;
    if (g.status === "VERIFIED") cur.verified += g._count._all;
    gateCounts.set(cat, cur);
  }

  const moveCount = new Map<string, number>();
  for (const m of moveGroup) {
    const cat = sessionToCat.get(m.sessionId);
    if (!cat) continue;
    moveCount.set(cat, (moveCount.get(cat) ?? 0) + m._count._all);
  }

  const revenueByCat = new Map<string, number>();
  for (const l of ledgerGroup) {
    if (!l.sessionId) continue;
    const cat = sessionToCat.get(l.sessionId);
    if (!cat) continue;
    revenueByCat.set(cat, (revenueByCat.get(cat) ?? 0) + (l._sum.revenueAmount ?? 0));
  }

  const contribMap = new Map(contribGroup.map((x) => [x.categoryId, x._count._all]));
  const reportMap = new Map(reportGroup.map((x) => [x.categoryId, x._count._all]));

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return catList
    .filter((c) => idSet.has(c.id))
    .map((c) => {
      const sessions = sessionByCat.get(c.id)?.length ?? 0;
      const gates = gateCounts.get(c.id) ?? { total: 0, verified: 0 };
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        color: c.color,
        status: c.status,
        sessions,
        players: playersByCat.get(c.id)?.size ?? 0,
        questionsAsked: moveCount.get(c.id) ?? 0,
        contributions: contribMap.get(c.id) ?? 0,
        reports: reportMap.get(c.id) ?? 0,
        gates: gates.total,
        verifiedGates: gates.verified,
        verificationRate: gates.total ? Math.round((gates.verified / gates.total) * 1000) / 10 : 0,
        estimatedRevenue: round2(revenueByCat.get(c.id) ?? 0),
        playCount: c.playCount,
        questionCount: c.questionCount,
      };
    })
    .filter((c) => c.sessions > 0 || c.contributions > 0 || c.gates > 0 || c.playCount > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 100);
}

// ============================================================
// QUESTIONS / CONTENT
// ============================================================

export type QuestionAnalyticsResponse = {
  totals: { total: number; normal: number; truth: number; dare: number; approved: number; pending: number; rejected: number; played: number; reported: number; aiRejectedAtSeed: number };
  difficulty: { difficulty: number; count: number }[];
  mostPlayed: { id: string; text: string; type: string; category: string; playsCount: number; reportCount: number; difficulty: number }[];
  leastPlayed: { id: string; text: string; type: string; category: string; playsCount: number }[];
  mostReported: { id: string; text: string; type: string; category: string; reportCount: number; playsCount: number }[];
  highestSkip: { id: string; text: string; type: string; category: string; skipped: number; answered: number }[];
};

export async function getQuestionAnalytics(): Promise<QuestionAnalyticsResponse> {
  const [total, normal, truth, dare, approved, pending, rejected, difficultyGroup] = await Promise.all([
    prisma.question.count(),
    prisma.question.count({ where: { type: "NORMAL" } }),
    prisma.question.count({ where: { type: "TRUTH" } }),
    prisma.question.count({ where: { type: "DARE" } }),
    prisma.question.count({ where: { status: "APPROVED" } }),
    prisma.question.count({ where: { status: "PENDING" } }),
    prisma.question.count({ where: { status: "REJECTED" } }),
    prisma.question.groupBy({ by: ["difficulty"], _count: { _all: true }, where: { status: "APPROVED" } }),
  ]);

  const playedAgg = await prisma.question.aggregate({ _sum: { playsCount: true, reportCount: true } });
  const reported = await prisma.question.count({ where: { reportCount: { gt: 0 } } });

  const [mostPlayed, mostReported] = await Promise.all([getTopQuestions(10), getTopQuestions(10)]);
  const leastPlayed = await prisma.question.findMany({
    where: { status: "APPROVED", playsCount: { gt: 0 } },
    orderBy: [{ playsCount: "asc" }, { createdAt: "desc" }],
    take: 10,
    select: { id: true, text: true, type: true, playsCount: true, difficulty: true, category: { select: { name: true } } },
  });
  const mostReportedRows = await prisma.question.findMany({
    where: { status: "APPROVED", reportCount: { gt: 0 } },
    orderBy: [{ reportCount: "desc" }, { playsCount: "desc" }],
    take: 10,
    select: { id: true, text: true, type: true, reportCount: true, playsCount: true, difficulty: true, category: { select: { name: true } } },
  });

  // Highest failure/skip: moves still unanswered (no answer recorded).
  const skipGroup = await prisma.gameMove.groupBy({
    by: ["questionId"],
    _count: { _all: true },
    where: { answeredAt: null, status: "PENDING_ANSWER" },
    orderBy: { _count: { questionId: "desc" } },
    take: 10,
  });
  const skipIds = skipGroup.map((s) => s.questionId);
  const skipQuestions = skipIds.length
    ? await prisma.question.findMany({
        where: { id: { in: skipIds } },
        select: { id: true, text: true, type: true, playsCount: true, category: { select: { name: true } }, moves: { select: { answeredAt: true } } },
      })
    : [];
  const answeredCount = await prisma.gameMove.groupBy({ by: ["questionId"], _count: { _all: true }, where: { answeredAt: { not: null }, questionId: { in: skipIds } } });
  const answeredMap = new Map(answeredCount.map((x) => [x.questionId, x._count._all]));
  const skipMap = new Map(skipGroup.map((x) => [x.questionId, x._count._all]));

  const pick = (rows: typeof mostPlayed) =>
    rows.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      category: q.category?.name ?? "",
      playsCount: q.playsCount,
      reportCount: q.reportCount,
      difficulty: q.difficulty,
    }));

  return {
    totals: {
      total,
      normal,
      truth,
      dare,
      approved,
      pending,
      rejected,
      played: playedAgg._sum.playsCount ?? 0,
      reported,
      aiRejectedAtSeed: 0,
    },
    difficulty: difficultyGroup
      .map((d) => ({ difficulty: d.difficulty, count: d._count._all }))
      .sort((a, b) => a.difficulty - b.difficulty),
    mostPlayed: pick(mostPlayed),
    leastPlayed: leastPlayed.map((q) => ({ id: q.id, text: q.text, type: q.type, category: q.category.name, playsCount: q.playsCount })),
    mostReported: mostReportedRows.map((q) => ({ id: q.id, text: q.text, type: q.type, category: q.category.name, reportCount: q.reportCount, playsCount: q.playsCount })),
    highestSkip: skipQuestions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      category: q.category.name,
      skipped: skipMap.get(q.id) ?? 0,
      answered: answeredMap.get(q.id) ?? 0,
    })),
  };
}

// ============================================================
// CONTRIBUTIONS
// ============================================================

export type ContributionAnalyticsResponse = {
  range: Range;
  totals: {
    submitted: number;
    pending: number;
    approved: number;
    rejected: number;
    flagged: number;
    exactDuplicates: number;
    verySimilar: number;
    unique: number;
    approvalRate: number;
    rejectionRate: number;
    duplicateRate: number;
    uniqueRate: number;
  };
  series: { date: string; submitted: number; approved: number; rejected: number; duplicates: number }[];
  byCategory: { categoryId: string; name: string; count: number }[];
  byType: { type: string; count: number }[];
  aiConfidence: { bucket: string; count: number }[];
  topContributors: { phone: string; count: number }[];
};

export async function getContributionAnalytics(from?: string, to?: string): Promise<ContributionAnalyticsResponse> {
  const r = resolveRange(from, to);
  const started = inRange(r);
  const [submitted, pending, approved, rejected, flagged, byCat, byType] = await Promise.all([
    prisma.contribution.count({ where: started }),
    prisma.contribution.count({ where: { status: "PENDING", ...started } }),
    prisma.contribution.count({ where: { status: "APPROVED", ...started } }),
    prisma.contribution.count({ where: { status: "REJECTED", ...started } }),
    prisma.contribution.count({ where: { status: "FLAGGED", ...started } }),
    prisma.contribution.groupBy({ by: ["categoryId"], _count: { _all: true }, where: started }),
    prisma.contribution.groupBy({ by: ["type"], _count: { _all: true }, where: started }),
  ]);

  const rows = await prisma.contribution.findMany({
    where: { ...started, aiResult: { not: Prisma.JsonNull } },
    select: { aiResult: true, aiScore: true, status: true, createdAt: true, categoryId: true, userPhone: true },
    take: 20000,
  });

  let exact = 0;
  let verySimilar = 0;
  let unique = 0;
  const confBuckets: Record<string, number> = { "0-0.4": 0, "0.4-0.7": 0, "0.7-0.85": 0, "0.85-1": 0 };
  const seriesByDay = new Map<string, { date: string; submitted: number; approved: number; rejected: number; duplicates: number }>();
  for (const row of rows) {
    const ai = row.aiResult as unknown as { classification?: string; aiAvailable?: boolean; score?: number } | null;
    const cls = ai?.classification ?? "UNKNOWN";
    if (cls === "EXACT_DUPLICATE") exact++;
    else if (cls === "VERY_SIMILAR") verySimilar++;
    else if (cls === "UNIQUE") unique++;
    const score = ai?.score ?? row.aiScore;
    if (score !== null && score !== undefined) {
      if (score < 0.4) confBuckets["0-0.4"]++;
      else if (score < 0.7) confBuckets["0.4-0.7"]++;
      else if (score < 0.85) confBuckets["0.7-0.85"]++;
      else confBuckets["0.85-1"]++;
    }
    const k = row.createdAt.toISOString().slice(0, 10);
    const cur = seriesByDay.get(k) ?? { date: k, submitted: 0, approved: 0, rejected: 0, duplicates: 0 };
    cur.submitted++;
    if (row.status === "APPROVED") cur.approved++;
    if (row.status === "REJECTED") cur.rejected++;
    if (cls === "EXACT_DUPLICATE" || cls === "VERY_SIMILAR") cur.duplicates++;
    seriesByDay.set(k, cur);
  }

  const [sSub, sApp, sRej] = await Promise.all([
    prisma.contribution.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.contribution.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { status: "APPROVED", ...started } }),
    prisma.contribution.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { status: "REJECTED", ...started } }),
  ]);
  const sSubMap = countRowsByDay(sSub as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const sAppMap = countRowsByDay(sApp as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const sRejMap = countRowsByDay(sRej as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const series = buildDaySeries(r.start, r.end).map((date) => ({
    date,
    submitted: sSubMap.get(date) ?? 0,
    approved: sAppMap.get(date) ?? 0,
    rejected: sRejMap.get(date) ?? 0,
    duplicates: seriesByDay.get(date)?.duplicates ?? 0,
  }));

  const catIds = byCat.map((c) => c.categoryId).filter((x): x is string => Boolean(x));
  const cats = catIds.length
    ? await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
    : [];
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const byCategory = byCat
    .map((c) => ({ categoryId: c.categoryId, name: catName.get(c.categoryId) ?? "Unknown", count: c._count._all }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  const contribByPhone = new Map<string, number>();
  for (const row of rows) contribByPhone.set(row.userPhone, (contribByPhone.get(row.userPhone) ?? 0) + 1);
  const topContributors = Array.from(contribByPhone.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([phone, count]) => ({ phone: maskPhone(phone), count }));

  return {
    range: r,
    totals: {
      submitted,
      pending,
      approved,
      rejected,
      flagged,
      exactDuplicates: exact,
      verySimilar,
      unique,
      approvalRate: submitted ? Math.round((approved / submitted) * 1000) / 10 : 0,
      rejectionRate: submitted ? Math.round((rejected / submitted) * 1000) / 10 : 0,
      duplicateRate: rows.length ? Math.round(((exact + verySimilar) / rows.length) * 1000) / 10 : 0,
      uniqueRate: rows.length ? Math.round((unique / rows.length) * 1000) / 10 : 0,
    },
    series,
    byCategory,
    byType: byType.map((t) => ({ type: t.type, count: t._count._all })).sort((a, b) => b.count - a.count),
    aiConfidence: Object.entries(confBuckets).map(([bucket, count]) => ({ bucket, count })),
    topContributors,
  };
}

// ============================================================
// GOOGLE AI & MODERATION
// ============================================================

export type AIAnalyticsResponse = {
  range: Range;
  totalChecked: number;
  aiAvailable: number;
  fallbackCases: number;
  byClassification: { classification: string; count: number }[];
  duplicateCount: number;
  uniqueCount: number;
  reviewRequired: number;
  averageConfidence: number;
  averageScore: number;
  duplicateRejectionRate: number;
  confidenceDistribution: { bucket: string; count: number }[];
  examples: { id: string; text: string; classification: string; confidence: number; score: number; status: string; createdAt: string }[];
  costData: { available: false; note: string };
};

export async function getAIAnalytics(from?: string, to?: string): Promise<AIAnalyticsResponse> {
  const r = resolveRange(from, to);
  const started = inRange(r);
  const rows = await prisma.contribution.findMany({
    where: { ...started, aiResult: { not: Prisma.JsonNull } },
    select: { id: true, question: true, status: true, aiResult: true, aiScore: true, createdAt: true, duplicateOfId: true },
    orderBy: { createdAt: "desc" },
    take: 30000,
  });

  const confBuckets: Record<string, number> = { "0-0.4": 0, "0.4-0.7": 0, "0.7-0.85": 0, "0.85-1": 0 };
  let aiAvailable = 0;
  let fallbackCases = 0;
  let duplicateCount = 0;
  let uniqueCount = 0;
  let reviewRequired = 0;
  let confSum = 0;
  let confN = 0;
  let scoreSum = 0;
  let scoreN = 0;
  const classMap = new Map<string, number>();

  for (const row of rows) {
    const ai = row.aiResult as unknown as {
      aiAvailable?: boolean;
      classification?: string;
      confidence?: number;
      score?: number;
      reviewRequired?: boolean;
    } | null;
    const cls = ai?.classification ?? "UNKNOWN";
    classMap.set(cls, (classMap.get(cls) ?? 0) + 1);
    if (ai?.aiAvailable) {
      aiAvailable++;
      if (typeof ai.confidence === "number") {
        confSum += ai.confidence;
        confN++;
        const c = ai.confidence;
        if (c < 0.4) confBuckets["0-0.4"]++;
        else if (c < 0.7) confBuckets["0.4-0.7"]++;
        else if (c < 0.85) confBuckets["0.7-0.85"]++;
        else confBuckets["0.85-1"]++;
      }
    } else {
      fallbackCases++;
    }
    if (cls === "EXACT_DUPLICATE" || cls === "VERY_SIMILAR") duplicateCount++;
    if (cls === "UNIQUE") uniqueCount++;
    if (ai?.reviewRequired) reviewRequired++;
    if (typeof ai?.score === "number") {
      scoreSum += ai.score;
      scoreN++;
    }
  }

  const rejected = await prisma.contribution.count({ where: { status: "REJECTED", ...started } });
  const rejectedAsDuplicate = await prisma.contribution.count({ where: { status: "REJECTED", duplicateOfId: { not: null }, ...started } });

  const examples = rows
    .filter((row) => {
      const ai = row.aiResult as unknown as { classification?: string } | null;
      return ai?.classification && ai.classification !== "UNKNOWN";
    })
    .slice(0, 10)
    .map((row) => {
      const ai = row.aiResult as unknown as { classification?: string; confidence?: number; score?: number } | null;
      return {
        id: row.id,
        text: row.question,
        classification: ai?.classification ?? "UNKNOWN",
        confidence: ai?.confidence ?? 0,
        score: ai?.score ?? row.aiScore ?? 0,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      };
    });

  return {
    range: r,
    totalChecked: rows.length,
    aiAvailable,
    fallbackCases,
    byClassification: Array.from(classMap.entries()).map(([classification, count]) => ({ classification, count })).sort((a, b) => b.count - a.count),
    duplicateCount,
    uniqueCount,
    reviewRequired,
    averageConfidence: confN ? Math.round((confSum / confN) * 100) / 100 : 0,
    averageScore: scoreN ? Math.round((scoreSum / scoreN) * 100) / 100 : 0,
    duplicateRejectionRate: rejected ? Math.round((rejectedAsDuplicate / rejected) * 1000) / 10 : 0,
    confidenceDistribution: Object.entries(confBuckets).map(([bucket, count]) => ({ bucket, count })),
    examples,
    costData: { available: false, note: "AI COST DATA NOT AVAILABLE" },
  };
}

// ============================================================
// WHATSAPP
// ============================================================

export type WhatsAppAdvancedResponse = {
  range: Range;
  totals: {
    inbound: number;
    outbound: number;
    sent: number;
    delivered: number;
    failed: number;
    read: number;
    unknown: number;
    conversations: number;
    activeUsers: number;
  };
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byDay: { date: string; inbound: number; outbound: number }[];
  byHour: { hour: number; count: number }[];
  templates: { templateId: string | null; name: string; total: number; delivered: number; read: number; failed: number; successRate: number }[];
  interactive: { type: string; count: number }[];
};

export async function getWhatsAppAdvanced(from?: string, to?: string): Promise<WhatsAppAdvancedResponse> {
  const r = resolveRange(from, to);
  const started = inRange(r);

  const [byStatus, byType, byDay] = await Promise.all([
    prisma.messageLog.groupBy({ by: ["status"], _count: { _all: true }, where: started }),
    prisma.messageLog.groupBy({ by: ["type"], _count: { _all: true }, where: started }),
    prisma.messageLog.groupBy({ by: ["createdAt", "direction"], _count: { _all: true }, where: started }),
  ]);

  const directionRows = await prisma.messageLog.groupBy({ by: ["direction"], _count: { _all: true }, where: started });
  const dirMap = new Map(directionRows.map((d) => [d.direction, d._count._all]));
  const inbound = dirMap.get("inbound") ?? 0;
  const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));

  const dayMap = new Map<string, { date: string; inbound: number; outbound: number }>();
  for (const row of byDay) {
    const k = row.createdAt.toISOString().slice(0, 10);
    const cur = dayMap.get(k) ?? { date: k, inbound: 0, outbound: 0 };
    if (row.direction === "inbound") cur.inbound += row._count._all;
    else cur.outbound += row._count._all;
    dayMap.set(k, cur);
  }
  const byDaySeries = buildDaySeries(r.start, r.end).map((date) => dayMap.get(date) ?? { date, inbound: 0, outbound: 0 });

  // Hour buckets are bounded (last 31 days max) to keep the work small.
  const hourStart = r.days > 31 ? new Date(Date.now() - 31 * 86_400_000) : r.start;
  const hourRows = await prisma.messageLog.findMany({
    where: { createdAt: { gte: hourStart, lte: r.end } },
    select: { createdAt: true },
    take: 60000,
  });
  const hourMap = new Map<number, number>();
  for (const row of hourRows) {
    const h = row.createdAt.getUTCHours();
    hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
  }
  const byHour = Array.from(hourMap.entries()).map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour - b.hour);

  // Templates
  const templateRows = await prisma.messageLog.findMany({
    where: { ...started, templateId: { not: null } },
    select: { templateId: true, status: true },
    take: 30000,
  });
  const templateAgg = new Map<string, { total: number; delivered: number; read: number; failed: number }>();
  for (const row of templateRows) {
    if (!row.templateId) continue;
    const cur = templateAgg.get(row.templateId) ?? { total: 0, delivered: 0, read: 0, failed: 0 };
    cur.total++;
    if (row.status === "delivered") cur.delivered++;
    if (row.status === "read") cur.read++;
    if (row.status === "failed") cur.failed++;
    templateAgg.set(row.templateId, cur);
  }
  const templateNames = await prisma.messageTemplate.findMany({ select: { id: true, name: true } });
  const templateNameMap = new Map(templateNames.map((t) => [t.id, t.name]));
  const templates = Array.from(templateAgg.entries())
    .map(([templateId, v]) => ({
      templateId,
      name: templateNameMap.get(templateId) ?? "Unknown",
      total: v.total,
      delivered: v.delivered,
      read: v.read,
      failed: v.failed,
      successRate: v.total ? Math.round(((v.delivered + v.read) / v.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  const conversations = await prisma.messageLog.findMany({ where: started, distinct: ["phone"], select: { phone: true } });

  const typeRows = byType.map((t) => ({ type: t.type, count: t._count._all })).sort((a, b) => b.count - a.count);
  const statusRows = byStatus.map((s) => ({ status: s.status, count: s._count._all })).sort((a, b) => b.count - a.count);

  // Interactive message types (from metadata.kind / type categorization)
  const interactiveNames = ["interactive", "button", "list", "template"];
  const interactive = typeRows
    .filter((t) => interactiveNames.includes((t.type ?? "").toLowerCase()))
    .map((t) => ({ type: t.type, count: t.count }));

  return {
    range: r,
    totals: {
      inbound,
      outbound: (statusMap["sent"] ?? 0) + (statusMap["delivered"] ?? 0) + (statusMap["read"] ?? 0) + (statusMap["failed"] ?? 0),
      sent: statusMap["sent"] ?? 0,
      delivered: statusMap["delivered"] ?? 0,
      failed: statusMap["failed"] ?? 0,
      read: statusMap["read"] ?? 0,
      unknown: statusMap["unknown"] ?? 0,
      conversations: conversations.length,
      activeUsers: conversations.length,
    },
    byType: typeRows,
    byStatus: statusRows,
    byDay: byDaySeries,
    byHour,
    templates,
    interactive,
  };
}

// ============================================================
// MONETIZATION
// ============================================================

export type MonetizationAnalyticsResponse = {
  range: Range;
  totals: {
    gates: number;
    pending: number;
    verified: number;
    expired: number;
    failed: number;
    cancelled: number;
    successRate: number;
    verificationRate: number;
    averageCompletionSeconds: number;
    averageAttempts: number;
    gatesPerSession: number;
    gatesPerUser: number;
    gatesPerRound: Record<string, number>;
  };
  byProvider: { providerId: string | null; name: string; gates: number; verified: number; linkOpens: number; codeRequests: number; failed: number; verificationRate: number; estimatedRevenue: number }[];
  byEvent: Record<string, number>;
  series: { date: string; gates: number; verified: number }[];
  funnel: { step: string; label: string; count: number; conversionPct: number | null; dropoffPct: number | null; note?: string }[];
};

export async function getMonetizationAnalytics(from?: string, to?: string): Promise<MonetizationAnalyticsResponse> {
  const r = resolveRange(from, to);
  const started = inRange(r);

  const [statusGroup, gates, verifiedRows, events, sessionCountForGates, userCountForGates] = await Promise.all([
    prisma.monetizationGate.groupBy({ by: ["status"], _count: { _all: true }, where: started }),
    prisma.monetizationGate.groupBy({ by: ["providerId", "sessionId"], _count: { _all: true }, where: started }),
    prisma.monetizationGate.findMany({
      where: { status: "VERIFIED", verifiedAt: { not: null }, ...started },
      select: { createdAt: true, verifiedAt: true, attempts: true },
      take: 30000,
    }),
    prisma.monetizationEvent.groupBy({ by: ["type"], _count: { _all: true }, where: started }),
    prisma.monetizationGate.findMany({ where: started, select: { sessionId: true }, take: 30000 }),
    prisma.monetizationGate.findMany({ where: started, select: { userId: true }, take: 30000 }),
  ]);

  const statusMap = new Map(statusGroup.map((s) => [s.status, s._count._all]));
  const totalGates = Array.from(statusMap.values()).reduce((a, b) => a + b, 0);
  const verified = statusMap.get("VERIFIED") ?? 0;
  const pending = statusMap.get("PENDING") ?? 0;
  const expired = statusMap.get("EXPIRED") ?? 0;
  const failed = statusMap.get("FAILED") ?? 0;
  const cancelled = statusMap.get("CANCELLED") ?? 0;

  const avgSeconds = verifiedRows.length
    ? Math.round((verifiedRows.reduce((acc, g) => acc + (g.verifiedAt!.getTime() - g.createdAt.getTime()) / 1000, 0) / verifiedRows.length) * 10) / 10
    : 0;
  const avgAttempts = verifiedRows.length ? Math.round((verifiedRows.reduce((acc, g) => acc + g.attempts, 0) / verifiedRows.length) * 100) / 100 : 0;

  const distinctSessions = new Set(sessionCountForGates.map((g) => g.sessionId)).size;
  const distinctUsers = new Set(userCountForGates.map((g) => g.userId)).size;

  const roundGroup = await prisma.monetizationGate.groupBy({ by: ["round"], _count: { _all: true }, where: started });
  const gatesPerRound: Record<string, number> = {};
  for (const row of roundGroup) gatesPerRound[String(row.round)] = row._count._all;

  // Provider performance
  const providerIds = Array.from(new Set(gates.map((g) => g.providerId).filter((x): x is string => Boolean(x))));
  const providers = providerIds.length
    ? await prisma.adProvider.findMany({ where: { id: { in: providerIds } }, select: { id: true, name: true, estimatedPayoutPerVerification: true, estimatedPayoutPerClick: true, estimatedPayoutPerImpression: true, fixedPayoutPerVerification: true, revenueModel: true } })
    : [];
  const providerName = new Map<string, { name: string; payoutRate: number }>();
  for (const p of providers) {
    const rate = p.fixedPayoutPerVerification > 0 || p.revenueModel === "FIXED"
      ? p.fixedPayoutPerVerification
      : p.estimatedPayoutPerVerification || p.estimatedPayoutPerClick;
    providerName.set(p.id, { name: p.name, payoutRate: rate });
  }

  const [linkEventRows, codeEventRows, verifyEventRows, failEventRows, ledgerProviderRows] = await Promise.all([
    prisma.monetizationEvent.groupBy({ by: ["sessionId"], _count: { _all: true }, where: { type: "LINK_OPENED", ...started } }),
    prisma.monetizationEvent.groupBy({ by: ["sessionId"], _count: { _all: true }, where: { type: "CODE_REQUESTED", ...started } }),
    prisma.monetizationEvent.groupBy({ by: ["sessionId"], _count: { _all: true }, where: { type: "VERIFICATION_SUCCESS", ...started } }),
    prisma.monetizationEvent.groupBy({ by: ["sessionId"], _count: { _all: true }, where: { type: "VERIFICATION_FAILED", ...started } }),
    prisma.revenueLedger.groupBy({ by: ["providerId"], _sum: { revenueAmount: true }, where: { ...started, isEstimated: true } }),
  ]);
  const linkMap = new Map(linkEventRows.map((x) => [x.sessionId, x._count._all]));
  const codeMap = new Map(codeEventRows.map((x) => [x.sessionId, x._count._all]));
  const verifyMap = new Map(verifyEventRows.map((x) => [x.sessionId, x._count._all]));
  const failMap = new Map(failEventRows.map((x) => [x.sessionId, x._count._all]));
  const ledgerProviderMap = new Map(ledgerProviderRows.map((x) => [x.providerId, x._sum.revenueAmount ?? 0]));

  const providerAgg = new Map<string, { providerId: string | null; name: string; gates: number; verified: number; linkOpens: number; codeRequests: number; failed: number; estimatedRevenue: number }>();
  const addProvider = (key: string | null) => {
    const id = key;
    const cur = providerAgg.get(id ?? "none") ?? {
      providerId: id,
      name: id ? providerName.get(id)?.name ?? "Unknown" : "No provider",
      gates: 0,
      verified: 0,
      linkOpens: 0,
      codeRequests: 0,
      failed: 0,
      estimatedRevenue: 0,
    };
    providerAgg.set(id ?? "none", cur);
    return cur;
  };

  const verifiedGates = await prisma.monetizationGate.findMany({
    where: { status: "VERIFIED", ...started },
    select: { sessionId: true, providerId: true },
    take: 30000,
  });
  const verifiedSessionMap = new Map<string, string>();
  for (const v of verifiedGates) verifiedSessionMap.set(v.sessionId, v.providerId ?? "none");

  for (const g of gates) addProvider(g.providerId);

  for (const [sessionId, n] of linkMap) {
    const p = providerAgg.get(verifiedSessionMap.get(sessionId ?? "") ?? "none") ?? addProvider(null);
    p.linkOpens += n;
  }
  for (const [sessionId, n] of codeMap) {
    const p = providerAgg.get(verifiedSessionMap.get(sessionId ?? "") ?? "none") ?? addProvider(null);
    p.codeRequests += n;
  }
  for (const [sessionId, n] of failMap) {
    const p = providerAgg.get(verifiedSessionMap.get(sessionId ?? "") ?? "none") ?? addProvider(null);
    p.failed += n;
  }

  // Assign gates / verified counts by provider using session->provider mapping.
  for (const g of gates) {
    const key = g.providerId ?? "none";
    const p = providerAgg.get(key)!;
    p.gates += g._count._all;
  }
  for (const v of verifiedGates) {
    const key = v.providerId ?? "none";
    const p = providerAgg.get(key)!;
    p.verified += 1;
  }
  for (const [provId, amount] of ledgerProviderMap) {
    const p = providerAgg.get(provId ?? "none");
    if (p) p.estimatedRevenue = Math.round(amount * 100) / 100;
  }

  const byProvider = Array.from(providerAgg.values())
    .map((p) => ({
      ...p,
      verificationRate: p.gates ? Math.round((p.verified / p.gates) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.verified - a.verified || b.gates - a.gates);

  // Events map + funnel
  const byEvent: Record<string, number> = {};
  for (const e of events) byEvent[e.type] = e._count._all;

  const moves = await prisma.gameMove.count({ where: started });
  const gateCreated = (statusMap.get("PENDING") ?? 0) + verified + expired + failed + cancelled;
  const linkOpened = byEvent["LINK_OPENED"] ?? 0;
  const countdownCompleted = byEvent["CODE_REQUESTED"] ?? 0; // code only becomes available after the countdown
  const codeRequested = byEvent["CODE_REQUESTED"] ?? 0;
  const codeSubmitted = (byEvent["VERIFICATION_ATTEMPT"] ?? 0) + (byEvent["VERIFICATION_SUCCESS"] ?? 0) + (byEvent["VERIFICATION_FAILED"] ?? 0);
  const verifiedCount = verified;
  const gameResumed = verifiedCount;

  const funnelSteps: { step: string; label: string; count: number; note?: string }[] = [
    { step: "GAMEPLAY", label: "Gameplay", count: moves },
    { step: "GATE_CREATED", label: "Gate created", count: gateCreated },
    { step: "LINK_OPENED", label: "Link opened", count: linkOpened },
    { step: "COUNTDOWN_COMPLETED", label: "Countdown completed", count: countdownCompleted, note: "derived from CODE_REQUESTED (code unlocks after countdown)" },
    { step: "CODE_REQUESTED", label: "Code requested", count: codeRequested },
    { step: "CODE_SUBMITTED", label: "Code submitted", count: codeSubmitted, note: "derived from verification attempts + outcomes" },
    { step: "VERIFIED", label: "Verified", count: verifiedCount },
    { step: "GAME_RESUMED", label: "Game resumed", count: gameResumed, note: "resumes immediately after verification" },
  ];
  const funnel = funnelSteps.map((step, i) => {
    const prev = i === 0 ? moves : funnelSteps[i - 1].count;
    return {
      step: step.step,
      label: step.label,
      count: step.count,
      note: step.note,
      conversionPct: prev ? Math.round((step.count / prev) * 1000) / 10 : 0,
      dropoffPct: i === 0 ? null : prev ? Math.round(((prev - step.count) / prev) * 1000) / 10 : 0,
    };
  });

  const [gateDaily, verifiedDaily] = await Promise.all([
    prisma.monetizationGate.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.monetizationGate.groupBy({ by: ["createdAt"], _count: { _all: true }, where: { status: "VERIFIED", ...started } }),
  ]);
  const gateMap = countRowsByDay(gateDaily as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const verMap = countRowsByDay(verifiedDaily as unknown as { createdAt: Date; _count: { _all: number } }[]);
  const series = buildDaySeries(r.start, r.end).map((date) => ({ date, gates: gateMap.get(date) ?? 0, verified: verMap.get(date) ?? 0 }));

  return {
    range: r,
    totals: {
      gates: totalGates,
      pending,
      verified,
      expired,
      failed,
      cancelled,
      successRate: totalGates ? Math.round((verified / totalGates) * 1000) / 10 : 0,
      verificationRate: totalGates ? Math.round((verified / totalGates) * 1000) / 10 : 0,
      averageCompletionSeconds: avgSeconds,
      averageAttempts: avgAttempts,
      gatesPerSession: distinctSessions ? Math.round((totalGates / distinctSessions) * 100) / 100 : 0,
      gatesPerUser: distinctUsers ? Math.round((totalGates / distinctUsers) * 100) / 100 : 0,
      gatesPerRound,
    },
    byProvider,
    byEvent,
    series,
    funnel,
  };
}

// ============================================================
// REVENUE
// ============================================================

export type RevenueAnalyticsResponse = {
  range: Range;
  totals: {
    estimated: number;
    confirmed: number;
    pending: number;
    paid: number;
    adjustments: number;
    total: number;
  };
  byProvider: { providerId: string | null; name: string; estimated: number; confirmed: number; total: number }[];
  byCategory: { name: string; amount: number }[];
  byEventType: { eventType: string; amount: number; rows: number }[];
  series: { date: string; estimated: number; confirmed: number; total: number }[];
};

export async function getRevenueAnalytics(from?: string, to?: string): Promise<RevenueAnalyticsResponse> {
  const r = resolveRange(from, to);
  const started = inRange(r);
  const rows = await prisma.revenueLedger.findMany({
    where: started,
    select: {
      id: true,
      createdAt: true,
      revenueAmount: true,
      status: true,
      isEstimated: true,
      eventType: true,
      providerId: true,
      sessionId: true,
    },
    orderBy: { createdAt: "desc" },
    take: 30000,
  });

  const estimated = rows.filter((x) => x.isEstimated && x.status !== "rejected").reduce((a, b) => a + b.revenueAmount, 0);
  const confirmed = rows.filter((x) => !x.isEstimated && x.status !== "rejected").reduce((a, b) => a + b.revenueAmount, 0);
  const pending = rows.filter((x) => x.status === "pending").reduce((a, b) => a + b.revenueAmount, 0);
  const paid = rows.filter((x) => x.status === "paid").reduce((a, b) => a + b.revenueAmount, 0);
  const adjustments = rows.filter((x) => x.eventType === "ADJUSTMENT" || (x.status === "rejected" && false)).reduce((a, b) => a + b.revenueAmount, 0);
  const total = estimated + confirmed;

  const byProviderMap = new Map<string, { providerId: string | null; name: string; estimated: number; confirmed: number; total: number }>();
  const addProv = (id: string | null) => {
    const key = id ?? "none";
    const cur = byProviderMap.get(key) ?? { providerId: id, name: id ? "" : "No provider", estimated: 0, confirmed: 0, total: 0 };
    byProviderMap.set(key, cur);
    return cur;
  };
  const providerIds = Array.from(new Set(rows.map((x) => x.providerId).filter((x): x is string => Boolean(x))));
  const providers = providerIds.length ? await prisma.adProvider.findMany({ where: { id: { in: providerIds } }, select: { id: true, name: true } }) : [];
  const provName = new Map(providers.map((p) => [p.id, p.name]));

  const eventTypeMap = new Map<string, { eventType: string; amount: number; rows: number }>();
  for (const row of rows) {
    const p = addProv(row.providerId);
    if (row.isEstimated && row.status !== "rejected") p.estimated += row.revenueAmount;
    if (!row.isEstimated && row.status !== "rejected") p.confirmed += row.revenueAmount;
    p.total += row.revenueAmount;
    const e = eventTypeMap.get(row.eventType) ?? { eventType: row.eventType, amount: 0, rows: 0 };
    e.amount += row.revenueAmount;
    e.rows += 1;
    eventTypeMap.set(row.eventType, e);
  }
  const byProvider = Array.from(byProviderMap.values())
    .map((p) => ({ ...p, name: p.name || provName.get(p.providerId!) || "Unknown", estimated: Math.round(p.estimated * 100) / 100, confirmed: Math.round(p.confirmed * 100) / 100, total: Math.round(p.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);

  // by category via session
  const sessionRows = rows.filter((x) => x.sessionId);
  const sessionIds = Array.from(new Set(sessionRows.map((x) => x.sessionId as string)));
  const catMap = new Map<string, { name: string; amount: number }>();
  if (sessionIds.length) {
    const sessions = await prisma.session.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, categoryId: true },
      take: 5000,
    });
    const sessionCat = new Map(sessions.filter((s) => s.categoryId).map((s) => [s.id, s.categoryId as string]));
    const allCatIds = Array.from(new Set(sessionCat.values())).filter(Boolean);
    const cats = allCatIds.length ? await prisma.category.findMany({ where: { id: { in: allCatIds } }, select: { id: true, name: true } }) : [];
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    for (const row of sessionRows) {
      const cat = sessionCat.get(row.sessionId!);
      if (!cat) continue;
      const cur = catMap.get(cat) ?? { name: catName.get(cat) ?? "Unknown", amount: 0 };
      cur.amount += row.revenueAmount;
      catMap.set(cat, cur);
    }
  }
  const byCategory = Array.from(catMap.values()).map((c) => ({ name: c.name, amount: Math.round(c.amount * 100) / 100 })).sort((a, b) => b.amount - a.amount).slice(0, 30);

  const daily = new Map<string, { date: string; estimated: number; confirmed: number; total: number }>();
  for (const row of rows) {
    if (row.status === "rejected") continue;
    const k = row.createdAt.toISOString().slice(0, 10);
    const cur = daily.get(k) ?? { date: k, estimated: 0, confirmed: 0, total: 0 };
    if (row.isEstimated) cur.estimated += row.revenueAmount;
    else cur.confirmed += row.revenueAmount;
    cur.total += row.revenueAmount;
    daily.set(k, cur);
  }
  const series = buildDaySeries(r.start, r.end).map((date) => {
    const d = daily.get(date) ?? { date, estimated: 0, confirmed: 0, total: 0 };
    return { date, estimated: Math.round(d.estimated * 100) / 100, confirmed: Math.round(d.confirmed * 100) / 100, total: Math.round(d.total * 100) / 100 };
  });

  return {
    range: r,
    totals: {
      estimated: Math.round(estimated * 100) / 100,
      confirmed: Math.round(confirmed * 100) / 100,
      pending: Math.round(pending * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      adjustments: Math.round(adjustments * 100) / 100,
      total: Math.round(total * 100) / 100,
    },
    byProvider,
    byCategory,
    byEventType: Array.from(eventTypeMap.values()).map((e) => ({ eventType: e.eventType, amount: Math.round(e.amount * 100) / 100, rows: e.rows })).sort((a, b) => b.amount - a.amount),
    series,
  };
}

// ============================================================
// TOP + TIMESERIES + EXPORT
// ============================================================

export type TimeseriesResponse = {
  range: Range;
  series: { date: string; users: number; sessions: number; moves: number; questions: number; contributions: number; reports: number; gates: number; messages: number; revenue: number }[];
};

export async function getTimeseries(from?: string, to?: string): Promise<TimeseriesResponse> {
  const r = resolveRange(from, to);
  const started = inRange(r);
  const [users, sessions, moves, questions, contributions, reports, gates, messages, revenue] = await Promise.all([
    prisma.user.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.session.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.gameMove.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.question.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.contribution.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.questionReport.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.monetizationGate.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.messageLog.groupBy({ by: ["createdAt"], _count: { _all: true }, where: started }),
    prisma.revenueLedger.groupBy({ by: ["createdAt"], _count: { _all: true }, _sum: { revenueAmount: true }, where: started }),
  ]);

  const toMap = countRowsByDay;
  const maps = {
    users: toMap(users as unknown as { createdAt: Date; _count: { _all: number } }[]),
    sessions: toMap(sessions as unknown as { createdAt: Date; _count: { _all: number } }[]),
    moves: toMap(moves as unknown as { createdAt: Date; _count: { _all: number } }[]),
    questions: toMap(questions as unknown as { createdAt: Date; _count: { _all: number } }[]),
    contributions: toMap(contributions as unknown as { createdAt: Date; _count: { _all: number } }[]),
    reports: toMap(reports as unknown as { createdAt: Date; _count: { _all: number } }[]),
    gates: toMap(gates as unknown as { createdAt: Date; _count: { _all: number } }[]),
    messages: toMap(messages as unknown as { createdAt: Date; _count: { _all: number } }[]),
  };
  const revenueMap = new Map<string, { count: number; sum: number }>();
  for (const row of revenue) {
    const k = row.createdAt.toISOString().slice(0, 10);
    const cur = revenueMap.get(k) ?? { count: 0, sum: 0 };
    cur.count += row._count._all;
    cur.sum += row._sum.revenueAmount ?? 0;
    revenueMap.set(k, cur);
  }

  const series = buildDaySeries(r.start, r.end).map((date) => ({
    date,
    users: maps.users.get(date) ?? 0,
    sessions: maps.sessions.get(date) ?? 0,
    moves: maps.moves.get(date) ?? 0,
    questions: maps.questions.get(date) ?? 0,
    contributions: maps.contributions.get(date) ?? 0,
    reports: maps.reports.get(date) ?? 0,
    gates: maps.gates.get(date) ?? 0,
    messages: maps.messages.get(date) ?? 0,
    revenue: Math.round((revenueMap.get(date)?.sum ?? 0) * 100) / 100,
  }));

  return { range: r, series };
}

export async function getTopAnalytics(from?: string, to?: string) {
  const r = resolveRange(from, to);
  const [topQuestions, topCategories, topContributors, topPlayers, topTemplates] = await Promise.all([
    getTopQuestions(10),
    getTopCategories(10),
    getContributionAnalytics(from, to).then((c) => c.topContributors),
    prisma.gameMove.groupBy({ by: ["answeredBy"], _count: { _all: true }, where: inRange(r), orderBy: { _count: { answeredBy: "desc" } }, take: 10 }),
    getWhatsAppAdvanced(from, to).then((w) => w.templates.slice(0, 10)),
  ]);

  const answeredIds = topPlayers.map((p) => p.answeredBy);
  const users = answeredIds.length
    ? await prisma.user.findMany({ where: { id: { in: answeredIds } }, select: { id: true, phone: true, name: true, displayName: true } })
    : [];
  const userMap = new Map(users.map((u) => [u.id, { phone: maskPhone(u.phone), name: u.displayName ?? u.name ?? null }]));

  return {
    mostPlayedQuestions: topQuestions.map((q) => ({ id: q.id, text: q.text, type: q.type, category: q.category?.name ?? "", playsCount: q.playsCount, reportCount: q.reportCount })),
    topCategories: topCategories.map((c) => ({ id: c.id, name: c.name, playCount: c.playCount, questionCount: c.questionCount, slug: c.slug, color: c.color })),
    topContributors,
    mostActivePlayers: topPlayers.map((p) => ({
      userId: p.answeredBy,
      phone: userMap.get(p.answeredBy)?.phone ?? "",
      name: userMap.get(p.answeredBy)?.name ?? null,
      answered: p._count._all,
    })),
    topTemplates,
  };
}

// ============================================================
// CSV EXPORT
// ============================================================

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function renderAnalyticsCsv(dataset: string, from?: string, to?: string): Promise<string> {
  const r = resolveRange(from, to);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);

  switch (dataset) {
    case "revenue": {
      const ledger = await getRevenueAnalytics(from, to);
      const rows = await prisma.revenueLedger.findMany({
        where: { createdAt: { gte: r.start, lte: r.end } },
        orderBy: { createdAt: "asc" },
        include: { provider: { select: { name: true } }, session: { select: { inviteCode: true } }, user: { select: { phone: true } }, createdBy: { select: { name: true } } },
        take: 20000,
      });
      return [
        ["Date", "Provider", "Type", "Source", "Session", "UserPhone", "Amount", "Payout", "Currency", "Status", "Estimated", "Reference", "Notes", "Created By"].join(","),
        ...rows.map((x) =>
          [
            dayKey(x.recordedAt ?? x.createdAt),
            x.provider?.name ?? "",
            x.eventType,
            x.type,
            x.session?.inviteCode ?? "",
            x.user?.phone ?? "",
            x.revenueAmount,
            x.payoutAmount,
            x.currency,
            x.status,
            x.isEstimated ? "ESTIMATED" : "CONFIRMED",
            x.providerReference ?? "",
            (x.notes ?? "").replace(/,/g, " "),
            x.createdBy?.name ?? "",
          ].map(csvCell).join(",")
        ),
      ].join("\n");
    }
    case "monetization": {
      const data = await getMonetizationAnalytics(from, to);
      const lines = ["date,gateStatus,count"];
      for (const point of data.series) lines.push(`${point.date},gates,${point.gates}`, `${point.date},verified,${point.verified}`);
      lines.push("provider,name,gates,verified,linkOpens,codeRequests,failed,verificationRate,estimatedRevenue");
      for (const p of data.byProvider) lines.push([p.providerId ?? "", p.name, p.gates, p.verified, p.linkOpens, p.codeRequests, p.failed, p.verificationRate, p.estimatedRevenue].map(csvCell).join(","));
      lines.push("funnel,label,count,conversionPct");
      for (const f of data.funnel) lines.push([f.step, f.label, f.count, f.conversionPct].map(csvCell).join(","));
      return lines.join("\n");
    }
    case "contributions": {
      const data = await getContributionAnalytics(from, to);
      const rows = await prisma.contribution.findMany({
        where: { createdAt: { gte: r.start, lte: r.end } },
        orderBy: { createdAt: "asc" },
        select: { ticket: true, userPhone: true, question: true, type: true, status: true, aiScore: true, createdAt: true },
        take: 20000,
      });
      return [
        ["Date", "Ticket", "Phone", "Question", "Type", "Status", "AI Score"].join(","),
        ...rows.map((x) => [dayKey(x.createdAt), x.ticket, x.userPhone, x.question.replace(/,/g, " "), x.type, x.status, x.aiScore ?? ""].map(csvCell).join(",")),
      ].join("\n");
    }
    case "sessions": {
      const rows = await prisma.session.findMany({
        where: { createdAt: { gte: r.start, lte: r.end } },
        orderBy: { createdAt: "asc" },
        select: { inviteCode: true, status: true, state: true, round: true, turnsPlayed: true, categoryId: true, createdAt: true, startedAt: true, finishedAt: true },
        take: 20000,
      });
      const catIds = Array.from(new Set(rows.map((x) => x.categoryId).filter((x): x is string => Boolean(x))));
      const cats = catIds.length ? await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : [];
      const catName = new Map(cats.map((c) => [c.id, c.name]));
      return [
        ["Date", "InviteCode", "Status", "State", "Round", "Turns", "Category", "StartedAt", "FinishedAt"].join(","),
        ...rows.map((x) => [dayKey(x.createdAt), x.inviteCode, x.status, x.state, x.round, x.turnsPlayed, catName.get(x.categoryId ?? "") ?? "", x.startedAt?.toISOString() ?? "", x.finishedAt?.toISOString() ?? ""].map(csvCell).join(",")),
      ].join("\n");
    }
    case "users": {
      const rows = await prisma.user.findMany({
        where: { createdAt: { gte: r.start, lte: r.end } },
        orderBy: { createdAt: "asc" },
        select: { phone: true, name: true, displayName: true, status: true, totalSessions: true, totalAnswered: true, totalAsked: true, firstSeenAt: true, lastSeenAt: true, createdAt: true },
        take: 20000,
      });
      return [
        ["Date", "Phone", "Name", "Status", "Sessions", "Answered", "Asked", "FirstSeen", "LastSeen"].join(","),
        ...rows.map((x) => [dayKey(x.createdAt), x.phone, x.displayName ?? x.name ?? "", x.status, x.totalSessions, x.totalAnswered, x.totalAsked, x.firstSeenAt?.toISOString() ?? "", x.lastSeenAt?.toISOString() ?? ""].map(csvCell).join(",")),
      ].join("\n");
    }
    case "questions": {
      const rows = await prisma.question.findMany({
        where: { createdAt: { gte: r.start, lte: r.end } },
        orderBy: { createdAt: "asc" },
        select: { text: true, type: true, status: true, difficulty: true, playsCount: true, reportCount: true, aiScore: true, categoryId: true, createdAt: true },
        take: 20000,
      });
      const catIds = Array.from(new Set(rows.map((x) => x.categoryId).filter((x): x is string => Boolean(x))));
      const cats = catIds.length ? await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : [];
      const catName = new Map(cats.map((c) => [c.id, c.name]));
      return [
        ["Date", "Question", "Type", "Status", "Difficulty", "Plays", "Reports", "Category", "AI Score"].join(","),
        ...rows.map((x) => [dayKey(x.createdAt), x.text.replace(/,/g, " "), x.type, x.status, x.difficulty, x.playsCount, x.reportCount, catName.get(x.categoryId) ?? "", x.aiScore ?? ""].map(csvCell).join(",")),
      ].join("\n");
    }
    case "ai": {
      const rows = await prisma.contribution.findMany({
        where: { createdAt: { gte: r.start, lte: r.end }, aiResult: { not: Prisma.JsonNull } },
        orderBy: { createdAt: "asc" },
        select: { ticket: true, question: true, type: true, status: true, aiScore: true, aiResult: true, createdAt: true },
        take: 20000,
      });
      return [
        ["Date", "Ticket", "Question", "Type", "Status", "Score", "Classification", "AI Available"].join(","),
        ...rows.map((x) => {
          const ai = x.aiResult as unknown as { classification?: string; aiAvailable?: boolean } | null;
          return [dayKey(x.createdAt), x.ticket, x.question.replace(/,/g, " "), x.type, x.status, x.aiScore ?? "", ai?.classification ?? "UNKNOWN", ai?.aiAvailable === true ? "yes" : "no"].map(csvCell).join(",");
        }),
      ].join("\n");
    }
    case "whatsapp": {
      const rows = await prisma.messageLog.findMany({
        where: { createdAt: { gte: r.start, lte: r.end } },
        orderBy: { createdAt: "asc" },
        select: { direction: true, phone: true, type: true, status: true, content: true, templateId: true, waMessageId: true, error: true, createdAt: true },
        take: 20000,
      });
      const contentToText = (content: unknown): string => {
        if (typeof content === "string") return content.replace(/,/g, " ").slice(0, 200);
        if (content && typeof content === "object") {
          const c = content as Record<string, unknown>;
          const t = c.text ?? c.body ?? c.caption;
          if (typeof t === "string") return t.replace(/,/g, " ").slice(0, 200);
        }
        return "";
      };
      return [
        ["Date", "Direction", "Phone", "Type", "Status", "Template", "WA Message", "Content", "Error"].join(","),
        ...rows.map((x) => [dayKey(x.createdAt), x.direction, x.phone, x.type, x.status, x.templateId ?? "", x.waMessageId ?? "", contentToText(x.content), (x.error ?? "").replace(/,/g, " ")].map(csvCell).join(",")),
      ].join("\n");
    }
    default: {
      // platform overview series
      const data = await getTimeseries(from, to);
      return [
        ["date", "users", "sessions", "moves", "questions", "contributions", "reports", "gates", "messages", "revenue"].join(","),
        ...data.series.map((p) => [p.date, p.users, p.sessions, p.moves, p.questions, p.contributions, p.reports, p.gates, p.messages, p.revenue].join(",")),
      ].join("\n");
    }
  }
}

// Expose the revenue settings list helper for the settings admin UI.
export async function getAnalyticsConfig() {
  const rows = await getAllSettings();
  const s = settingsToRecord(rows);
  const revenueSettings = await getRevenueSettings();
  return {
    analyticsEnabled: settingBool(s, "analytics.enabled", true),
    analyticsRetentionDays: Math.max(1, Number(s["analytics.retentionDays"] || 365)),
    revenueEstimationEnabled: settingBool(s, "revenue.estimationEnabled", true),
    revenueEstimationMode: s["revenue.estimationMode"] || "provider_rates",
    currency: revenueSettings.currency,
    revenuePerVerification: revenueSettings.revenuePerVerification,
    payoutRate: revenueSettings.payoutRate,
  };
}