"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit, paginate, type PaginatedResult } from "./shared";

export type MonetizationConfig = {
  enabled: boolean;
  revenuePerVerification: number;
  payoutRate: number;
  currency: string;
  minPayout: number;
};

export type MonetizationStats = {
  totalRevenue: number;
  totalPayout: number;
  pendingPayout: number;
  paidPayout: number;
  totalGates: number;
  verifiedGates: number;
  pendingGates: number;
  totalProviders: number;
  activeProviders: number;
};

export type AdProvider = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  enabled: boolean;
  archived: boolean;
  priority: number;
  configuration: unknown;
  revenueModel: string;
  currency: string;
  cpmRate: number;
  cpcRate: number;
  cpaRate: number;
  fixedPayoutPerVerification: number;
  estimatedPayoutPerVerification: number;
  estimatedPayoutPerClick: number;
  estimatedPayoutPerImpression: number;
  createdAt: string;
};

export type AdTypesMeta = { providerTypes: string[]; eventTypes: string[] };

export type ProviderStats = {
  impressions: number;
  clicks: number;
  conversions: number;
  verifications: number;
  revenue: { estimated: number; confirmed: number };
  payout: { estimated: number; confirmed: number };
};

export type AdSnippet = {
  id: string;
  name: string;
  providerId: string | null;
  type: string;
  content: string | null;
  directLink: string | null;
  placement: string;
  enabled: boolean;
  archived: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export type Gate = {
  id: string;
  sessionId: string;
  userId: string;
  round: number;
  status: string;
  unlockAt: string;
  expiresAt: string;
  verifiedAt: string | null;
  attempts: number;
  providerId: string | null;
  createdAt: string;
  session: { id: string; inviteCode: string } | null;
  user: { id: string; phone: string; name: string | null } | null;
  provider: { id: string; name: string } | null;
};

export type GateEvent = {
  id: string;
  gateId: string;
  type: string;
  status: string;
  amount: number;
  createdAt: string;
  gate: { id: string; round: number; session: { id: string; inviteCode: string } | null } | null;
};

async function readSettings(keys: string[]): Promise<Record<string, string>> {
  const { data } = await serverSupabase().from("Setting").select("key, value").in("key", keys);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.key] = row.value;
  }
  return map;
}

export async function getMonetizationConfig(): Promise<MonetizationConfig> {
  await requireAdmin();
  const s = await readSettings(["monetization.enabled", "monetization.revenuePerVerification", "monetization.payoutRate", "monetization.currency", "monetization.minPayout"]);
  return {
    enabled: ["1", "true", "yes", "on"].includes((s["monetization.enabled"] ?? "").toLowerCase()),
    revenuePerVerification: Number(s["monetization.revenuePerVerification"] ?? 0.25),
    payoutRate: Number(s["monetization.payoutRate"] ?? 0.5),
    currency: (s["monetization.currency"] || "USD").slice(0, 8).toUpperCase(),
    minPayout: Number(s["monetization.minPayout"] ?? 50),
  };
}

export async function updateMonetizationConfig(input: MonetizationConfig): Promise<MonetizationConfig> {
  const admin = await requireAdmin();
  const entries = [
    { key: "monetization.enabled", value: input.enabled ? "1" : "0", group: "monetization" },
    { key: "monetization.revenuePerVerification", value: String(input.revenuePerVerification), group: "monetization" },
    { key: "monetization.payoutRate", value: String(input.payoutRate), group: "monetization" },
    { key: "monetization.currency", value: input.currency.slice(0, 8).toUpperCase(), group: "monetization" },
    { key: "monetization.minPayout", value: String(input.minPayout), group: "monetization" },
  ];
  for (const e of entries) {
    await serverSupabase().from("Setting").upsert(e, { onConflict: "key" });
  }
  await audit(admin.id, "MONETIZATION_CONFIG_UPDATE", "monetization", undefined, { ...input });
  return getMonetizationConfig();
}

export async function getMonetizationStats(): Promise<MonetizationStats> {
  await requireAdmin();
  const [totalGates, verifiedGates, pendingGates, totalProviders, activeProviders] = await Promise.all([
    serverSupabase().from("MonetizationGate").select("*", { count: "exact", head: true }),
    serverSupabase().from("MonetizationGate").select("*", { count: "exact", head: true }).eq("status", "VERIFIED"),
    serverSupabase().from("MonetizationGate").select("*", { count: "exact", head: true }).eq("status", "PENDING"),
    serverSupabase().from("AdProvider").select("*", { count: "exact", head: true }),
    serverSupabase().from("AdProvider").select("*", { count: "exact", head: true }).eq("enabled", true),
  ]);
  return {
    totalRevenue: 0, totalPayout: 0, pendingPayout: 0, paidPayout: 0,
    totalGates: totalGates.count ?? 0, verifiedGates: verifiedGates.count ?? 0,
    pendingGates: pendingGates.count ?? 0, totalProviders: totalProviders.count ?? 0,
    activeProviders: activeProviders.count ?? 0,
  };
}

export async function listMonetizationProviders(params: { page?: number; limit?: number } = {}): Promise<PaginatedResult<AdProvider>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;
  const { data, error, count } = await serverSupabase()
    .from("AdProvider")
    .select("id, name, type, description, enabled, archived, priority, configuration, revenueModel, currency, cpmRate, cpcRate, cpaRate, fixedPayoutPerVerification, estimatedPayoutPerVerification, estimatedPayoutPerClick, estimatedPayoutPerImpression, createdAt", { count: "exact" })
    .order("createdAt", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return paginate((data ?? []) as AdProvider[], page, limit, count ?? 0);
}

export async function getMonetizationTypes(): Promise<AdTypesMeta> {
  await requireAdmin();
  return {
    providerTypes: ["CUSTOM", "SCRIPT", "DIRECT_LINK", "ADSENSE", "ADSTERRA", "META_ADS"],
    eventTypes: ["IMPRESSION", "CLICK", "VERIFICATION", "PAYOUT", "ADJUSTMENT"],
  };
}

export async function getProviderStats(providerId: string): Promise<ProviderStats> {
  await requireAdmin();
  return { impressions: 0, clicks: 0, conversions: 0, verifications: 0, revenue: { estimated: 0, confirmed: 0 }, payout: { estimated: 0, confirmed: 0 } };
}

export async function listMonetizationSnippets(params: { page?: number; limit?: number; includeArchived?: boolean } = {}): Promise<PaginatedResult<AdSnippet>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;
  let query = serverSupabase()
    .from("AdSnippet")
    .select("id, name, providerId, type, content, directLink, placement, enabled, archived, priority, createdAt, updatedAt", { count: "exact" });
  if (!params.includeArchived) query = query.eq("archived", false);
  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return paginate((data ?? []) as AdSnippet[], page, limit, count ?? 0);
}

export async function listMonetizationGates(params: { page?: number; limit?: number; status?: string } = {}): Promise<PaginatedResult<Gate>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;
  let query = serverSupabase()
    .from("MonetizationGate")
    .select("id, sessionId, userId, round, status, unlockAt, expiresAt, verifiedAt, attempts, providerId, createdAt, Session:sessionId(id, inviteCode), User:userId(id, phone, name), Provider:providerId(id, name)", { count: "exact" });
  if (params.status) query = query.eq("status", params.status);
  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r, session: r.Session, user: r.User, provider: r.Provider,
  })) as Gate[];
  return paginate(items, page, limit, count ?? 0);
}

export async function listMonetizationEvents(params: { page?: number; limit?: number; type?: string } = {}): Promise<PaginatedResult<GateEvent>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;
  let query = serverSupabase()
    .from("MonetizationEvent")
    .select("id, gateId, type, status, amount, createdAt, Gate:gateId(id, round, Session:sessionId(id, inviteCode))", { count: "exact" });
  if (params.type) query = query.eq("type", params.type);
  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r, gate: r.Gate ? { ...r.Gate as Record<string, unknown>, session: (r.Gate as Record<string, unknown>).Session } : null,
  })) as GateEvent[];
  return paginate(items, page, limit, count ?? 0);
}

export async function createMonetizationProvider(input: Partial<AdProvider>): Promise<AdProvider> {
  const admin = await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("AdProvider")
    .insert({
      name: input.name ?? "New Provider", type: input.type ?? "CUSTOM",
      description: input.description ?? null, enabled: input.enabled ?? true,
      priority: input.priority ?? 100, configuration: input.configuration ?? null,
      revenueModel: input.revenueModel ?? "CPA", currency: input.currency ?? "USD",
      cpmRate: input.cpmRate ?? 0, cpcRate: input.cpcRate ?? 0, cpaRate: input.cpaRate ?? 0,
      fixedPayoutPerVerification: input.fixedPayoutPerVerification ?? 0,
    })
    .select("*").single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "CREATE", "ad_provider", (data as Record<string, unknown>).id as string);
  return data as unknown as AdProvider;
}

export async function updateMonetizationProvider(id: string, input: Partial<AdProvider>): Promise<AdProvider> {
  const admin = await requireAdmin();
  const update: Record<string, unknown> = {};
  for (const key of ["name", "type", "description", "enabled", "archived", "priority", "configuration", "revenueModel", "currency", "cpmRate", "cpcRate", "cpaRate", "fixedPayoutPerVerification"]) {
    if (key in input) update[key] = input[key as keyof AdProvider];
  }
  const { data, error } = await serverSupabase().from("AdProvider").update(update).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "UPDATE", "ad_provider", id);
  return data as unknown as AdProvider;
}

export async function deleteMonetizationProvider(id: string): Promise<void> {
  const admin = await requireAdmin();
  await serverSupabase().from("AdProvider").delete().eq("id", id);
  await audit(admin.id, "DELETE", "ad_provider", id);
}

export async function toggleProviderStatus(id: string, data: { enabled?: boolean; archived?: boolean }): Promise<void> {
  const admin = await requireAdmin();
  const update: Record<string, unknown> = {};
  if (typeof data.enabled === "boolean") update.enabled = data.enabled;
  if (typeof data.archived === "boolean") update.archived = data.archived;
  await serverSupabase().from("AdProvider").update(update).eq("id", id);
  await audit(admin.id, "UPDATE", "ad_provider", id);
}

export async function createMonetizationSnippet(input: Partial<AdSnippet>): Promise<AdSnippet> {
  const admin = await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("AdSnippet")
    .insert({
      name: input.name ?? "New Snippet", providerId: input.providerId ?? null,
      type: input.type ?? "HTML", content: input.content ?? null,
      directLink: input.directLink ?? null, placement: input.placement ?? "TOP",
      enabled: input.enabled ?? true, priority: input.priority ?? 100,
    })
    .select("*").single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "CREATE", "ad_snippet", (data as Record<string, unknown>).id as string);
  return data as unknown as AdSnippet;
}

export async function updateMonetizationSnippet(id: string, input: Partial<AdSnippet>): Promise<AdSnippet> {
  const admin = await requireAdmin();
  const update: Record<string, unknown> = {};
  for (const key of ["name", "providerId", "type", "content", "directLink", "placement", "enabled", "archived", "priority"]) {
    if (key in input) update[key] = input[key as keyof AdSnippet];
  }
  const { data, error } = await serverSupabase().from("AdSnippet").update(update).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "UPDATE", "ad_snippet", id);
  return data as unknown as AdSnippet;
}

export async function toggleSnippetStatus(id: string, data: { enabled?: boolean; archived?: boolean }): Promise<void> {
  const admin = await requireAdmin();
  const update: Record<string, unknown> = {};
  if (typeof data.enabled === "boolean") update.enabled = data.enabled;
  if (typeof data.archived === "boolean") update.archived = data.archived;
  await serverSupabase().from("AdSnippet").update(update).eq("id", id);
  await audit(admin.id, "UPDATE", "ad_snippet", id);
}
