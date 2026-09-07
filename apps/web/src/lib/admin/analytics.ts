"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, paginate, type PaginatedResult } from "./shared";

// Simplified analytics server actions — returns basic counts from the database.
// Complex aggregations (trends, comparisons, snapshots) return defaults.

export type OverviewResponse = {
  totals: { users: number; sessions: number; questions: number; contributions: number; reports: number };
  trends: { users: { value: number; previous: number; changePct: number | null; direction: "up" | "down" | "flat" }; sessions: { value: number; previous: number; changePct: number | null; direction: "up" | "down" | "flat" }; questions: { value: number; previous: number; changePct: number | null; direction: "up" | "down" | "flat" } };
  charts: { sessionsByDay: { date: string; count: number }[]; contributionsByDay: { date: string; count: number }[] };
};

export type AdminAnalytics = Record<string, unknown>;
export type SessionAnalyticsResponse = Record<string, unknown>;
export type QuestionAnalyticsResponse = Record<string, unknown>;
export type ContributionAnalyticsResponse = Record<string, unknown>;
export type AIAnalyticsResponse = Record<string, unknown>;
export type WhatsAppAdvancedResponse = Record<string, unknown>;
export type MonetizationAnalyticsResponse = Record<string, unknown>;
export type RevenueAnalyticsResponse = Record<string, unknown>;
export type CategoryStat = { id: string; name: string; slug: string; questionCount: number; sessionCount: number };
export type CategoryRanking = { id: string; name: string; slug: string; plays: number; sessions: number; contributions: number; reports: number };
export type SnapshotRow = { id: string; date: string; users: number; sessions: number; questions: number; contributions: number };

async function countTable(table: string, filter?: Record<string, unknown>): Promise<number> {
  const q = serverSupabase().from(table).select("*", { count: "exact", head: true });
  const { count } = filter ? await q.match(filter) : await q;
  return count ?? 0;
}

export async function getAnalyticsOverview(params: { from?: string; to?: string } = {}): Promise<OverviewResponse> {
  await requireAdmin();
  const [users, sessions, questions, contributions, reports] = await Promise.all([
    countTable("User"), countTable("Session"), countTable("Question"),
    countTable("Contribution"), countTable("QuestionReport"),
  ]);
  return {
    totals: { users, sessions, questions, contributions, reports },
    trends: {
      users: { value: users, previous: 0, changePct: null, direction: "flat" },
      sessions: { value: sessions, previous: 0, changePct: null, direction: "flat" },
      questions: { value: questions, previous: 0, changePct: null, direction: "flat" },
    },
    charts: { sessionsByDay: [], contributionsByDay: [] },
  };
}

export async function getAnalytics(params: { from?: string; to?: string } = {}): Promise<AdminAnalytics> {
  await requireAdmin();
  return {};
}

export async function getAnalyticsSessions(params: { from?: string; to?: string } = {}): Promise<SessionAnalyticsResponse> {
  await requireAdmin();
  return {};
}

export async function getAdvancedQuestionStats(): Promise<QuestionAnalyticsResponse> {
  await requireAdmin();
  return {};
}

export async function getAnalyticsContributions(params: { from?: string; to?: string } = {}): Promise<ContributionAnalyticsResponse> {
  await requireAdmin();
  return {};
}

export async function getAdvancedAiStats(params: { from?: string; to?: string } = {}): Promise<AIAnalyticsResponse> {
  await requireAdmin();
  return {};
}

export async function getAdvancedWhatsAppStats(params: { from?: string; to?: string } = {}): Promise<WhatsAppAdvancedResponse> {
  await requireAdmin();
  return {};
}

export async function getAnalyticsMonetization(params: { from?: string; to?: string } = {}): Promise<MonetizationAnalyticsResponse> {
  await requireAdmin();
  return {};
}

export async function getAnalyticsRevenue(params: { from?: string; to?: string } = {}): Promise<RevenueAnalyticsResponse> {
  await requireAdmin();
  return {};
}

export async function getAnalyticsCategories(): Promise<CategoryStat[]> {
  await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("Category")
    .select("id, name, slug, questionCount")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id, name: r.name, slug: r.slug,
    questionCount: r.questionCount ?? 0, sessionCount: 0,
  })) as CategoryStat[];
}

export async function getAnalyticsCategoryRankings(): Promise<CategoryRanking[]> {
  await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("Category")
    .select("id, name, slug, questionCount")
    .order("questionCount", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id, name: r.name, slug: r.slug,
    plays: 0, sessions: 0, contributions: 0, reports: 0,
  })) as CategoryRanking[];
}

export async function getAnalyticsSnapshots(days = 120): Promise<SnapshotRow[]> {
  await requireAdmin();
  return [];
}

export async function captureAnalyticsSnapshot(): Promise<void> {
  await requireAdmin();
}
