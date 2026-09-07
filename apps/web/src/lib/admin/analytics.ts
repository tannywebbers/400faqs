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

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportAnalyticsCsv(dataset: string, params: { from?: string; to?: string }): Promise<string> {
  await requireAdmin();
  const sb = serverSupabase();

  if (dataset === "overview") {
    const { data } = await sb.from("Session").select("createdAt").order("createdAt", { ascending: true });
    const columns = ["date", "users", "questions", "sessions", "moves", "contributions", "reports", "categoryRequests", "messages", "revenueLedger"];
    const header = columns.map(csvEscape).join(",");
    return [header].join("\n");
  }

  if (dataset === "sessions") {
    const { data } = await sb.from("Session").select("id, inviteCode, status, createdAt, creatorId, joinerId").order("createdAt", { ascending: false }).limit(500);
    const columns = ["id", "inviteCode", "status", "createdAt", "creatorId", "joinerId"];
    const header = columns.map(csvEscape).join(",");
    const rows = (data ?? []).map((r: Record<string, unknown>) => columns.map((c) => csvEscape(r[c])).join(","));
    return [header, ...rows].join("\n");
  }

  if (dataset === "questions") {
    const { data } = await sb.from("Question").select("id, text, type, status, source, playsCount, reportCount, createdAt").order("createdAt", { ascending: false }).limit(500);
    const columns = ["id", "text", "type", "status", "source", "playsCount", "reportCount", "createdAt"];
    const header = columns.map(csvEscape).join(",");
    const rows = (data ?? []).map((r: Record<string, unknown>) => columns.map((c) => csvEscape(r[c])).join(","));
    return [header, ...rows].join("\n");
  }

  if (dataset === "contributions") {
    const { data } = await sb.from("Contribution").select("id, text, type, status, source, createdAt").order("createdAt", { ascending: false }).limit(500);
    const columns = ["id", "text", "type", "status", "source", "createdAt"];
    const header = columns.map(csvEscape).join(",");
    const rows = (data ?? []).map((r: Record<string, unknown>) => columns.map((c) => csvEscape(r[c])).join(","));
    return [header, ...rows].join("\n");
  }

  if (dataset === "whatsapp") {
    const { data } = await sb.from("MessageLog").select("id, direction, phone, type, status, createdAt").order("createdAt", { ascending: false }).limit(500);
    const columns = ["id", "direction", "phone", "type", "status", "createdAt"];
    const header = columns.map(csvEscape).join(",");
    const rows = (data ?? []).map((r: Record<string, unknown>) => columns.map((c) => csvEscape(r[c])).join(","));
    return [header, ...rows].join("\n");
  }

  if (dataset === "monetization") {
    const { data } = await sb.from("MonetizationGate").select("id, round, status, attempts, createdAt, verifiedAt").order("createdAt", { ascending: false }).limit(500);
    const columns = ["id", "round", "status", "attempts", "createdAt", "verifiedAt"];
    const header = columns.map(csvEscape).join(",");
    const rows = (data ?? []).map((r: Record<string, unknown>) => columns.map((c) => csvEscape(r[c])).join(","));
    return [header, ...rows].join("\n");
  }

  if (dataset === "revenue") {
    const { data } = await sb.from("RevenueLedger").select("id, type, eventType, currency, revenueAmount, payoutAmount, status, createdAt").order("createdAt", { ascending: false }).limit(500);
    const columns = ["id", "type", "eventType", "currency", "revenueAmount", "payoutAmount", "status", "createdAt"];
    const header = columns.map(csvEscape).join(",");
    const rows = (data ?? []).map((r: Record<string, unknown>) => columns.map((c) => csvEscape(r[c])).join(","));
    return [header, ...rows].join("\n");
  }

  // ai and other datasets
  return csvEscape("No data available for dataset: " + dataset);
}
