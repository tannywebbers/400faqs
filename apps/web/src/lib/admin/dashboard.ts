"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, paginate, type PaginatedResult } from "./shared";

export type DashboardStats = {
  totals: {
    users: number;
    categories: number;
    questions: number;
    pendingQuestions: number;
    approvedQuestions: number;
    pendingQuestions2: number;
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
  today: { questions: number; sessions: number; contributions: number; users: number };
  recentActivity: { id: string; type: string; title: string; createdAt: string }[];
};

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await requireAdmin();
  const sb = serverSupabase();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayIso = startOfDay.toISOString();

  const count = (table: string, filter?: Record<string, unknown>) =>
    sb.from(table).select("*", { count: "exact", head: true }).match(filter ?? {});

  const [
    users, categories, questions, pendingQuestions, approvedQuestions,
    sessions, activeSessions, completedSessions, moves, contributions, pendingContributions,
    reports, openReports, categoryRequests, pendingCategoryRequests, contactMessages,
    todayQuestions, todaySessions, todayContributions, todayUsers,
  ] = await Promise.all([
    count("User"), count("Category"), count("Question"),
    count("Question", { status: "PENDING" }), count("Question", { status: "APPROVED" }),
    count("Session"), count("Session", { status: "ACTIVE" }), count("Session", { status: "COMPLETED" }),
    count("GameMove"), count("Contribution"), count("Contribution", { status: "PENDING" }),
    count("QuestionReport"), count("QuestionReport", { status: "OPEN" }),
    count("CategoryRequest"), count("CategoryRequest", { status: "PENDING" }),
    count("ContactMessage", { status: "new" }),
    sb.from("Question").select("*", { count: "exact", head: true }).gte("createdAt", startOfDayIso),
    sb.from("Session").select("*", { count: "exact", head: true }).gte("createdAt", startOfDayIso),
    sb.from("Contribution").select("*", { count: "exact", head: true }).gte("createdAt", startOfDayIso),
    sb.from("User").select("*", { count: "exact", head: true }).gte("createdAt", startOfDayIso),
  ]);

  const [recentContributions, recentReports, recentRequests] = await Promise.all([
    sb.from("Contribution").select("id, question, status, createdAt").order("createdAt", { ascending: false }).limit(5),
    sb.from("QuestionReport").select("id, ticket, reason, status, createdAt").order("createdAt", { ascending: false }).limit(5),
    sb.from("CategoryRequest").select("id, name, status, createdAt").order("createdAt", { ascending: false }).limit(5),
  ]);

  const recentActivity = [
    ...((recentContributions.data ?? []).map((c) => ({ id: c.id, type: "contribution", title: `Contribution: "${truncate(c.question, 60)}"`, createdAt: c.createdAt }))),
    ...((recentReports.data ?? []).map((r) => ({ id: r.id, type: "report", title: `${r.ticket} - ${r.reason}`, createdAt: r.createdAt }))),
    ...((recentRequests.data ?? []).map((r) => ({ id: r.id, type: "category_request", title: `Category request: ${r.name}`, createdAt: r.createdAt }))),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 15);

  return {
    totals: {
      users: users.count ?? 0,
      categories: categories.count ?? 0,
      questions: questions.count ?? 0,
      pendingQuestions: pendingQuestions.count ?? 0,
      approvedQuestions: approvedQuestions.count ?? 0,
      pendingQuestions2: pendingQuestions.count ?? 0,
      sessions: sessions.count ?? 0,
      activeSessions: activeSessions.count ?? 0,
      completedSessions: completedSessions.count ?? 0,
      moves: moves.count ?? 0,
      contributions: contributions.count ?? 0,
      pendingContributions: pendingContributions.count ?? 0,
      reports: reports.count ?? 0,
      openReports: openReports.count ?? 0,
      categoryRequests: categoryRequests.count ?? 0,
      pendingCategoryRequests: pendingCategoryRequests.count ?? 0,
      contactMessages: contactMessages.count ?? 0,
    },
    today: {
      questions: todayQuestions.count ?? 0,
      sessions: todaySessions.count ?? 0,
      contributions: todayContributions.count ?? 0,
      users: todayUsers.count ?? 0,
    },
    recentActivity,
  };
}

export type OpsData = {
  queues: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number; paused: number }>;
  moderationQueue: { pendingNotifications: number; failedNotifications: number; stuckNotifications: number };
  recentEvents: { id: string; component: string; status: string; message: string; createdAt: string }[];
};

export async function getDashboardOps(): Promise<OpsData> {
  await requireAdmin();
  const sb = serverSupabase();

  const [pendingNotifications, failedNotifications, recentEvents] = await Promise.all([
    sb.from("Notification").select("*", { count: "exact", head: true }).eq("status", "PENDING"),
    sb.from("Notification").select("*", { count: "exact", head: true }).eq("status", "FAILED"),
    sb.from("SystemEvent").select("id, component, status, message, createdAt").order("createdAt", { ascending: false }).limit(10),
  ]);

  const fifteenMinAgo = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count: stuckCount } = await sb.from("Notification").select("*", { count: "exact", head: true }).eq("status", "SENDING").lt("updatedAt", fifteenMinAgo);

  return {
    queues: {},
    moderationQueue: {
      pendingNotifications: pendingNotifications.count ?? 0,
      failedNotifications: failedNotifications.count ?? 0,
      stuckNotifications: stuckCount ?? 0,
    },
    recentEvents: (recentEvents.data ?? []) as OpsData["recentEvents"],
  };
}

export type RevenueSnapshot = {
  totals: { estimated: number; confirmed: number; total: number; paid: number };
};

export async function getRevenueSnapshot(): Promise<RevenueSnapshot> {
  await requireAdmin();
  const sb = serverSupabase();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [confirmed, paid] = await Promise.all([
    sb.from("RevenueLedger").select("amount", { count: "exact", head: false }).eq("status", "confirmed").gte("createdAt", thirtyDaysAgo),
    sb.from("RevenueLedger").select("amount", { count: "exact", head: false }).eq("status", "paid").gte("createdAt", thirtyDaysAgo),
  ]);

  const sumAmounts = (rows: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  const confirmedTotal = sumAmounts(confirmed.data as { amount: number }[] | null);
  const paidTotal = sumAmounts(paid.data as { amount: number }[] | null);

  return {
    totals: {
      estimated: confirmedTotal,
      confirmed: confirmedTotal,
      total: confirmedTotal + paidTotal,
      paid: paidTotal,
    },
  };
}
