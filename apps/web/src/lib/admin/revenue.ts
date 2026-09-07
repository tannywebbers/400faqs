"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit, paginate, type PaginatedResult } from "./shared";

export type RevenueConfig = {
  revenuePerVerification: number;
  payoutRate: number;
  currency: string;
};

export type RevenueStats = {
  rows: number;
  revenueTotal: number;
  payoutTotal: number;
  pendingRows: number;
  pendingRevenue: number;
  confirmedRows: number;
  confirmedRevenue: number;
  paidRows: number;
  paidRevenue: number;
  autoRows: number;
  manualRows: number;
  currency: string;
  averageRevenue: number;
};

export type LedgerRow = {
  id: string;
  type: string;
  providerId: string | null;
  sessionId: string | null;
  userId: string | null;
  currency: string;
  revenueAmount: number;
  payoutAmount: number;
  revenueShare: number;
  status: string;
  providerReference: string | null;
  notes: string | null;
  createdAt: string;
  provider: { id: string; name: string } | null;
  session: { id: string; inviteCode: string } | null;
  user: { id: string; phone: string; name: string | null } | null;
};

async function readSettings(keys: string[]): Promise<Record<string, string>> {
  const { data } = await serverSupabase()
    .from("Setting")
    .select("key, value")
    .in("key", keys);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.key] = row.value;
  }
  return map;
}

export async function getRevenueConfig(): Promise<RevenueConfig> {
  await requireAdmin();
  const s = await readSettings(["monetization.revenuePerVerification", "monetization.payoutRate", "monetization.currency"]);
  return {
    revenuePerVerification: Number(s["monetization.revenuePerVerification"] ?? 0.25),
    payoutRate: Number(s["monetization.payoutRate"] ?? 0.5),
    currency: (s["monetization.currency"] || "USD").slice(0, 8).toUpperCase(),
  };
}

export async function updateRevenueConfig(input: RevenueConfig): Promise<RevenueConfig> {
  const admin = await requireAdmin();
  const entries = [
    { key: "monetization.revenuePerVerification", value: String(input.revenuePerVerification), group: "monetization" },
    { key: "monetization.payoutRate", value: String(input.payoutRate), group: "monetization" },
    { key: "monetization.currency", value: input.currency.slice(0, 8).toUpperCase(), group: "monetization" },
  ];
  for (const e of entries) {
    await serverSupabase().from("Setting").upsert(e, { onConflict: "key" });
  }
  await audit(admin.id, "REVENUE_SETTINGS_UPDATED", "revenue", undefined, { ...input });
  return getRevenueConfig();
}

export async function getRevenueStats(params: { from?: string; to?: string } = {}): Promise<RevenueStats> {
  await requireAdmin();
  let query = serverSupabase().from("RevenueLedger").select("revenueAmount, payoutAmount, status, type, currency");
  if (params.from) query = query.gte("createdAt", params.from);
  if (params.to) query = query.lte("createdAt", params.to + "T23:59:59");
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const currency = rows[0]?.currency ?? "USD";
  const stats: RevenueStats = {
    rows: rows.length,
    revenueTotal: rows.reduce((a, r) => a + (r.revenueAmount ?? 0), 0),
    payoutTotal: rows.reduce((a, r) => a + (r.payoutAmount ?? 0), 0),
    pendingRows: 0, pendingRevenue: 0,
    confirmedRows: 0, confirmedRevenue: 0,
    paidRows: 0, paidRevenue: 0,
    autoRows: 0, manualRows: 0,
    currency,
    averageRevenue: 0,
  };
  for (const r of rows) {
    if (r.status === "pending") { stats.pendingRows++; stats.pendingRevenue += r.revenueAmount ?? 0; }
    else if (r.status === "confirmed") { stats.confirmedRows++; stats.confirmedRevenue += r.revenueAmount ?? 0; }
    else if (r.status === "paid") { stats.paidRows++; stats.paidRevenue += r.revenueAmount ?? 0; }
    if (r.type === "AUTO") stats.autoRows++; else stats.manualRows++;
  }
  stats.averageRevenue = rows.length > 0 ? stats.revenueTotal / rows.length : 0;
  return stats;
}

export async function listRevenueLedger(params: { page?: number; limit?: number; status?: string; from?: string; to?: string } = {}): Promise<PaginatedResult<LedgerRow>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 30;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("RevenueLedger")
    .select("id, type, providerId, sessionId, userId, currency, revenueAmount, payoutAmount, revenueShare, status, providerReference, notes, createdAt, Provider:providerId(id, name), Session:sessionId(id, inviteCode), User:userId(id, phone, name)", { count: "exact" });
  if (params.status) query = query.eq("status", params.status);
  if (params.from) query = query.gte("createdAt", params.from);
  if (params.to) query = query.lte("createdAt", params.to + "T23:59:59");
  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id, type: r.type, providerId: r.providerId as string | null, sessionId: r.sessionId as string | null,
    userId: r.userId as string | null, currency: r.currency, revenueAmount: r.revenueAmount,
    payoutAmount: r.payoutAmount, revenueShare: r.revenueShare, status: r.status,
    providerReference: r.providerReference as string | null, notes: r.notes as string | null,
    createdAt: r.createdAt, provider: r.Provider as LedgerRow["provider"], session: r.Session as LedgerRow["session"],
    user: r.User as LedgerRow["user"],
  })) as LedgerRow[];

  return paginate(items, page, limit, count ?? 0);
}

export async function addManualLedgerEntry(input: {
  revenueAmount: number;
  payoutAmount?: number;
  currency?: string;
  providerReference?: string;
  notes?: string;
  status?: string;
}): Promise<LedgerRow> {
  const admin = await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("RevenueLedger")
    .insert({
      type: "MANUAL",
      eventType: "ADJUSTMENT",
      currency: input.currency ?? "USD",
      revenueAmount: input.revenueAmount,
      payoutAmount: input.payoutAmount ?? 0,
      revenueShare: 0,
      status: input.status ?? "pending",
      isEstimated: false,
      providerReference: input.providerReference ?? null,
      notes: input.notes ?? null,
      createdById: admin.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "REVENUE_MANUAL_ENTRY", "revenue", (data as Record<string, unknown>).id as string, { revenueAmount: input.revenueAmount });
  return data as unknown as LedgerRow;
}

export async function updateLedgerStatus(id: string, status: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase().from("RevenueLedger").select("id, status").eq("id", id).single();
  if (!existing) throw new Error("Ledger entry not found");
  await serverSupabase().from("RevenueLedger").update({ status }).eq("id", id);
  await audit(admin.id, "REVENUE_STATUS_CHANGED", "revenue", id, { to: status });
}

export async function backfillRevenue(): Promise<{ created: number }> {
  const admin = await requireAdmin();
  await audit(admin.id, "REVENUE_BACKFILL", "revenue");
  return { created: 0 };
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportRevenueCsv(params: { from?: string; to?: string; status?: string }): Promise<string> {
  await requireAdmin();
  let query = serverSupabase()
    .from("RevenueLedger")
    .select("id, type, eventType, currency, revenueAmount, payoutAmount, revenueShare, status, providerReference, notes, createdAt, Provider:providerId(name), Session:sessionId(inviteCode), User:userId(phone, name)")
    .order("createdAt", { ascending: false })
    .limit(1000);
  if (params.status) query = query.eq("status", params.status);
  if (params.from) query = query.gte("createdAt", params.from);
  if (params.to) query = query.lte("createdAt", params.to + "T23:59:59");
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const columns = ["id", "type", "eventType", "currency", "revenueAmount", "payoutAmount", "revenueShare", "status", "providerReference", "notes", "createdAt", "provider", "session", "user"];
  const header = columns.map(csvEscape).join(",");
  const rows = (data ?? []).map((r: Record<string, unknown>) => {
    const provider = r.Provider as Record<string, string> | null;
    const session = r.Session as Record<string, string> | null;
    const user = r.User as Record<string, string> | null;
    return columns.map((c) => {
      if (c === "provider") return csvEscape(provider?.name ?? "");
      if (c === "session") return csvEscape(session?.inviteCode ?? "");
      if (c === "user") return csvEscape(user?.phone ?? "");
      return csvEscape(r[c]);
    }).join(",");
  });
  return [header, ...rows].join("\n");
}
