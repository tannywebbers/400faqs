"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit, paginate, type PaginatedResult } from "./shared";

// ── Types (match the admin page expectations) ─────────────────

export type MonetizationConfig = {
  enabled: boolean;
  roundInterval: number;
  countdownSeconds: number;
  codeExpiryMinutes: number;
  linkExpiryMinutes: number;
  maxAttempts: number;
  codeLength: number;
  codeType: "numeric" | "alphanumeric";
  rotation: "priority" | "random";
  defaultProviderId: string;
  defaultSnippetId: string;
  directLink: string;
  directLinkEnabled: boolean;
};

export type MonetizationStats = {
  total: number;
  pending: number;
  verified: number;
  expired: number;
  failed: number;
  cancelled: number;
  failedVerifications: number;
  successRate: number;
  averageVerificationSeconds: number;
  last7Days: Record<string, number>;
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
  placements: unknown;
  revenueModel: string;
  currency: string;
  cpmRate: number;
  cpcRate: number;
  cpaRate: number;
  fixedPayoutPerVerification: number;
  createdAt: string;
  _count?: { snippets: number; gates: number };
};

export type AdTypesMeta = {
  providerTypes: string[];
  placements: string[];
  eventTypes: string[];
};

export type ProviderStats = {
  impressions: number;
  clicks: number;
  conversions: number;
  verifications: number;
  verifiedGates: number;
  ctr: number;
  conversionRate: number;
  revenue: { estimated: number; confirmed: number; paid: number; payoutEstimated: number };
  byEventType: { eventType: string; rows: number; amount: number }[];
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
  provider?: { id: string; name: string } | null;
};

export type Gate = {
  id: string;
  round: number;
  publicToken: string;
  status: string;
  attempts: number;
  createdAt: string;
  verifiedAt: string | null;
  unlockAt: string;
  expiresAt: string;
  user?: { id: string; phone: string; name: string | null };
  session?: { id: string; inviteCode: string; status: string; category: { name: string } | null };
  provider?: { id: string; name: string } | null;
};

export type GateEvent = {
  id: string;
  type: string;
  status: string;
  metadata: unknown;
  createdAt: string;
  user?: { id: string; phone: string; name: string | null };
  session?: { id: string; inviteCode: string };
  provider?: { id: string; name: string } | null;
  placement?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────

const SETTINGS_DEFAULTS: Record<string, string> = {
  "monetization.enabled": "false",
  "monetization.roundInterval": "3",
  "monetization.countdownSeconds": "15",
  "monetization.codeExpiryMinutes": "10",
  "monetization.linkExpiryMinutes": "30",
  "monetization.maxAttempts": "5",
  "monetization.codeLength": "6",
  "monetization.codeType": "numeric",
  "monetization.rotation": "priority",
  "monetization.defaultProviderId": "",
  "monetization.defaultSnippetId": "",
  "monetization.directLink": "",
  "monetization.directLinkEnabled": "true",
};

async function readSettings(keys: string[]): Promise<Record<string, string>> {
  const { data } = await serverSupabase().from("Setting").select("key, value").in("key", keys);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.key] = row.value;
  }
  return map;
}

function isTruthy(v: string): boolean {
  return ["1", "true", "yes", "on"].includes((v ?? "").toLowerCase());
}

// ── Config ────────────────────────────────────────────────────

export async function getMonetizationConfig(): Promise<MonetizationConfig> {
  await requireAdmin();
  const s = await readSettings(Object.keys(SETTINGS_DEFAULTS));
  const raw = (key: string): string => s[key] ?? SETTINGS_DEFAULTS[key] ?? "";
  const num = (key: string, fallback: number): number => {
    const n = Number(raw(key));
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    enabled: isTruthy(raw("monetization.enabled")),
    roundInterval: Math.max(1, num("monetization.roundInterval", 3)),
    countdownSeconds: Math.max(0, num("monetization.countdownSeconds", 15)),
    codeExpiryMinutes: Math.max(1, num("monetization.codeExpiryMinutes", 10)),
    linkExpiryMinutes: Math.max(1, num("monetization.linkExpiryMinutes", 30)),
    maxAttempts: Math.max(1, num("monetization.maxAttempts", 5)),
    codeLength: Math.min(10, Math.max(4, num("monetization.codeLength", 6))),
    codeType: raw("monetization.codeType") === "alphanumeric" ? "alphanumeric" : "numeric",
    rotation: raw("monetization.rotation") === "random" ? "random" : "priority",
    defaultProviderId: raw("monetization.defaultProviderId"),
    defaultSnippetId: raw("monetization.defaultSnippetId"),
    directLink: raw("monetization.directLink"),
    directLinkEnabled: isTruthy(raw("monetization.directLinkEnabled")),
  };
}

export async function updateMonetizationConfig(input: MonetizationConfig): Promise<MonetizationConfig> {
  const admin = await requireAdmin();
  const entries: { key: string; value: string; group: string }[] = [
    { key: "monetization.enabled", value: String(input.enabled), group: "monetization" },
    { key: "monetization.roundInterval", value: String(input.roundInterval), group: "monetization" },
    { key: "monetization.countdownSeconds", value: String(input.countdownSeconds), group: "monetization" },
    { key: "monetization.codeExpiryMinutes", value: String(input.codeExpiryMinutes), group: "monetization" },
    { key: "monetization.linkExpiryMinutes", value: String(input.linkExpiryMinutes), group: "monetization" },
    { key: "monetization.maxAttempts", value: String(input.maxAttempts), group: "monetization" },
    { key: "monetization.codeLength", value: String(input.codeLength), group: "monetization" },
    { key: "monetization.codeType", value: input.codeType, group: "monetization" },
    { key: "monetization.rotation", value: input.rotation, group: "monetization" },
    { key: "monetization.defaultProviderId", value: input.defaultProviderId, group: "monetization" },
    { key: "monetization.defaultSnippetId", value: input.defaultSnippetId, group: "monetization" },
    { key: "monetization.directLink", value: input.directLink, group: "monetization" },
    { key: "monetization.directLinkEnabled", value: String(input.directLinkEnabled), group: "monetization" },
  ];
  for (const e of entries) {
    await serverSupabase().from("Setting").upsert(e, { onConflict: "key" });
  }
  await audit(admin.id, "MONETIZATION_CONFIG_UPDATE", "monetization", undefined, { ...input });
  return getMonetizationConfig();
}

// ── Stats ─────────────────────────────────────────────────────

export async function getMonetizationStats(): Promise<MonetizationStats> {
  await requireAdmin();
  const sb = serverSupabase();
  const [total, pending, verified, expired, failed, cancelled, failedEvents] = await Promise.all([
    sb.from("MonetizationGate").select("*", { count: "exact", head: true }),
    sb.from("MonetizationGate").select("*", { count: "exact", head: true }).eq("status", "PENDING"),
    sb.from("MonetizationGate").select("*", { count: "exact", head: true }).eq("status", "VERIFIED"),
    sb.from("MonetizationGate").select("*", { count: "exact", head: true }).eq("status", "EXPIRED"),
    sb.from("MonetizationGate").select("*", { count: "exact", head: true }).eq("status", "FAILED"),
    sb.from("MonetizationGate").select("*", { count: "exact", head: true }).eq("status", "CANCELLED"),
    sb.from("MonetizationEvent").select("*", { count: "exact", head: true }).eq("type", "VERIFICATION_FAILED"),
  ]);

  // Verified gates with timing for average verification seconds
  const { data: verifiedGates } = await sb
    .from("MonetizationGate")
    .select("createdAt, verifiedAt")
    .eq("status", "VERIFIED")
    .not("verifiedAt", "is", null);

  let avgSeconds = 0;
  if (verifiedGates && verifiedGates.length > 0) {
    const sum = verifiedGates.reduce((acc: number, g: Record<string, string>) => {
      const created = new Date(g.createdAt).getTime();
      const verified = new Date(g.verifiedAt).getTime();
      return acc + (verified - created) / 1000;
    }, 0);
    avgSeconds = Math.round((sum / verifiedGates.length) * 10) / 10;
  }

  // Last 7 days gate counts by day
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentGates } = await sb
    .from("MonetizationGate")
    .select("createdAt")
    .gte("createdAt", sevenDaysAgo);

  const last7Days: Record<string, number> = {};
  for (const g of recentGates ?? []) {
    const day = (g as Record<string, string>).createdAt.slice(0, 10);
    last7Days[day] = (last7Days[day] ?? 0) + 1;
  }

  const totalCount = total.count ?? 0;
  const verifiedCount = verified.count ?? 0;

  return {
    total: totalCount,
    pending: pending.count ?? 0,
    verified: verifiedCount,
    expired: expired.count ?? 0,
    failed: failed.count ?? 0,
    cancelled: cancelled.count ?? 0,
    failedVerifications: failedEvents.count ?? 0,
    successRate: totalCount ? Math.round((verifiedCount / totalCount) * 1000) / 10 : 0,
    averageVerificationSeconds: avgSeconds,
    last7Days,
  };
}

// ── Types meta ────────────────────────────────────────────────

export async function getMonetizationTypes(): Promise<AdTypesMeta> {
  await requireAdmin();
  return {
    providerTypes: ["CUSTOM", "SCRIPT", "DIRECT_LINK", "ADSENSE", "ADSTERRA", "META_ADS"],
    placements: ["TOP", "BOTTOM", "HOME_INLINE", "FAQ_BOTTOM", "RESULT_PAGE", "GATE", "CONTRIBUTION_PAGE", "CATEGORY_PAGE_RIGHT"],
    eventTypes: ["IMPRESSION", "CLICK", "CONVERSION", "VERIFICATION", "PAYOUT", "ADJUSTMENT", "GATE_CREATED", "LINK_OPENED", "CODE_REQUESTED", "CODE_GENERATED", "VERIFICATION_ATTEMPT", "VERIFICATION_SUCCESS", "VERIFICATION_FAILED", "GATE_EXPIRED", "GATE_CANCELLED", "CALLBACK"],
  };
}

// ── Providers ─────────────────────────────────────────────────

export async function listMonetizationProviders(params: { page?: number; limit?: number; includeArchived?: boolean } = {}): Promise<PaginatedResult<AdProvider>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;
  let query = serverSupabase()
    .from("AdProvider")
    .select("id, name, type, description, enabled, archived, priority, configuration, placements, revenueModel, currency, cpmRate, cpcRate, cpaRate, fixedPayoutPerVerification, createdAt", { count: "exact" });
  if (!params.includeArchived) query = query.eq("archived", false);
  query = query.order("priority", { ascending: true }).order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  // Fetch _count for snippets and gates per provider
  const providers = (data ?? []) as unknown as AdProvider[];
  if (providers.length > 0) {
    const ids = providers.map((p) => p.id);
    const [snippets, gates] = await Promise.all([
      serverSupabase().from("AdSnippet").select("providerId").in("providerId", ids),
      serverSupabase().from("MonetizationGate").select("providerId").in("providerId", ids),
    ]);
    const snippetCounts: Record<string, number> = {};
    for (const s of snippets.data ?? []) snippetCounts[(s as Record<string, string>).providerId] = (snippetCounts[(s as Record<string, string>).providerId] ?? 0) + 1;
    const gateCounts: Record<string, number> = {};
    for (const g of gates.data ?? []) gateCounts[(g as Record<string, string>).providerId] = (gateCounts[(g as Record<string, string>).providerId] ?? 0) + 1;
    for (const p of providers) {
      p._count = { snippets: snippetCounts[p.id] ?? 0, gates: gateCounts[p.id] ?? 0 };
    }
  }

  return paginate(providers, page, limit, count ?? 0);
}

export async function getProviderStats(providerId: string): Promise<ProviderStats> {
  await requireAdmin();
  const sb = serverSupabase();
  const [impressions, clicks, conversions, verifications, gates, ledger] = await Promise.all([
    sb.from("MonetizationEvent").select("*", { count: "exact", head: true }).eq("providerId", providerId).eq("type", "IMPRESSION"),
    sb.from("MonetizationEvent").select("*", { count: "exact", head: true }).eq("providerId", providerId).eq("type", "CLICK"),
    sb.from("MonetizationEvent").select("*", { count: "exact", head: true }).eq("providerId", providerId).eq("type", "CONVERSION"),
    sb.from("MonetizationEvent").select("*", { count: "exact", head: true }).eq("providerId", providerId).eq("type", "VERIFICATION"),
    sb.from("MonetizationGate").select("*", { count: "exact", head: true }).eq("providerId", providerId).eq("status", "VERIFIED"),
    sb.from("RevenueLedger").select("status, isEstimated, revenueAmount, payoutAmount, eventType").eq("providerId", providerId),
  ]);

  const impCount = impressions.count ?? 0;
  const clickCount = clicks.count ?? 0;
  const convCount = conversions.count ?? 0;

  const rows = (ledger.data ?? []) as Array<Record<string, unknown>>;
  const estimatedRows = rows.filter((r) => r.isEstimated);
  const confirmedRows = rows.filter((r) => !r.isEstimated && r.status !== "rejected");
  const paidRows = rows.filter((r) => r.status === "paid");

  const sumRevenue = (rs: Array<Record<string, unknown>>) => rs.reduce((a, r) => a + (Number(r.revenueAmount) ?? 0), 0);
  const sumPayout = (rs: Array<Record<string, unknown>>) => rs.reduce((a, r) => a + (Number(r.payoutAmount) ?? 0), 0);

  const eventTypes = [...new Set(rows.map((r) => String(r.eventType)))];
  const byEventType = eventTypes.map((t) => {
    const subset = rows.filter((r) => String(r.eventType) === t);
    return { eventType: t, rows: subset.length, amount: Math.round(sumRevenue(subset) * 100) / 100 };
  });

  return {
    impressions: impCount,
    clicks: clickCount,
    conversions: convCount,
    verifications: verifications.count ?? 0,
    verifiedGates: gates.count ?? 0,
    ctr: impCount ? Math.round((clickCount / impCount) * 1000) / 10 : 0,
    conversionRate: clickCount ? Math.round((convCount / clickCount) * 1000) / 10 : 0,
    revenue: {
      estimated: Math.round(sumRevenue(estimatedRows) * 100) / 100,
      confirmed: Math.round(sumRevenue(confirmedRows) * 100) / 100,
      paid: Math.round(sumRevenue(paidRows) * 100) / 100,
      payoutEstimated: Math.round(sumPayout(estimatedRows) * 100) / 100,
    },
    byEventType,
  };
}

export async function testProviderConfig(providerId: string): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  await requireAdmin();
  const { data, error } = await serverSupabase().from("AdProvider").select("*").eq("id", providerId).single();
  if (error || !data) throw new Error("Provider not found");

  const provider = data as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!provider.name) errors.push("Provider name is required");
  if (!provider.type) errors.push("Provider type is required");

  // Validate configuration is valid JSON if present
  if (provider.configuration) {
    try {
      JSON.parse(JSON.stringify(provider.configuration));
    } catch {
      errors.push("Configuration is not valid JSON");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export async function createMonetizationProvider(input: Partial<AdProvider> & { placements?: unknown }): Promise<AdProvider> {
  const admin = await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("AdProvider")
    .insert({
      name: input.name ?? "New Provider",
      type: input.type ?? "CUSTOM",
      description: input.description ?? null,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 100,
      configuration: input.configuration ?? null,
      placements: input.placements ?? null,
      revenueModel: input.revenueModel ?? "CPA",
      currency: input.currency ?? "USD",
      cpmRate: input.cpmRate ?? 0,
      cpcRate: input.cpcRate ?? 0,
      cpaRate: input.cpaRate ?? 0,
      fixedPayoutPerVerification: input.fixedPayoutPerVerification ?? 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "CREATE", "ad_provider", (data as Record<string, unknown>).id as string);
  return data as unknown as AdProvider;
}

export async function updateMonetizationProvider(id: string, input: Partial<AdProvider> & { placements?: unknown }): Promise<AdProvider> {
  const admin = await requireAdmin();
  const update: Record<string, unknown> = {};
  for (const key of ["name", "type", "description", "enabled", "archived", "priority", "configuration", "placements", "revenueModel", "currency", "cpmRate", "cpcRate", "cpaRate", "fixedPayoutPerVerification"]) {
    if (key in input) update[key] = input[key as keyof AdProvider];
  }
  const { data, error } = await serverSupabase().from("AdProvider").update(update).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "UPDATE", "ad_provider", id);
  return data as unknown as AdProvider;
}

export async function deleteMonetizationProvider(id: string): Promise<void> {
  const admin = await requireAdmin();
  // Check for history before hard-deleting
  const [ledgerCount, gateCount, eventCount] = await Promise.all([
    serverSupabase().from("RevenueLedger").select("*", { count: "exact", head: true }).eq("providerId", id),
    serverSupabase().from("MonetizationGate").select("*", { count: "exact", head: true }).eq("providerId", id),
    serverSupabase().from("MonetizationEvent").select("*", { count: "exact", head: true }).eq("providerId", id),
  ]);
  const hasHistory = (ledgerCount.count ?? 0) > 0 || (gateCount.count ?? 0) > 0 || (eventCount.count ?? 0) > 0;
  if (hasHistory) {
    await serverSupabase().from("AdProvider").update({ archived: true }).eq("id", id);
    await audit(admin.id, "ARCHIVE", "ad_provider", id, { reason: "delete_requested_has_history" });
  } else {
    await serverSupabase().from("AdProvider").delete().eq("id", id);
    await audit(admin.id, "DELETE", "ad_provider", id);
  }
}

export async function toggleProviderStatus(id: string, data: { enabled?: boolean; archived?: boolean }): Promise<void> {
  const admin = await requireAdmin();
  const update: Record<string, unknown> = {};
  if (typeof data.enabled === "boolean") update.enabled = data.enabled;
  if (typeof data.archived === "boolean") update.archived = data.archived;
  await serverSupabase().from("AdProvider").update(update).eq("id", id);
  await audit(admin.id, "UPDATE", "ad_provider", id);
}

// ── Snippets ──────────────────────────────────────────────────

export async function listMonetizationSnippets(params: { page?: number; limit?: number; includeArchived?: boolean } = {}): Promise<PaginatedResult<AdSnippet>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;
  let query = serverSupabase()
    .from("AdSnippet")
    .select("id, name, providerId, type, content, directLink, placement, enabled, archived, priority, createdAt, Provider:providerId(id, name)", { count: "exact" });
  if (!params.includeArchived) query = query.eq("archived", false);
  query = query.order("priority", { ascending: true }).order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    provider: r.Provider ?? null,
  })) as unknown as AdSnippet[];
  return paginate(items, page, limit, count ?? 0);
}

export async function createMonetizationSnippet(input: Partial<AdSnippet>): Promise<AdSnippet> {
  const admin = await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("AdSnippet")
    .insert({
      name: input.name ?? "New Snippet",
      providerId: input.providerId ?? null,
      type: input.type ?? "HTML",
      content: input.content ?? null,
      directLink: input.directLink ?? null,
      placement: input.placement ?? "TOP",
      enabled: input.enabled ?? true,
      priority: input.priority ?? 100,
    })
    .select("*")
    .single();
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

// ── Gates ─────────────────────────────────────────────────────

export async function listMonetizationGates(params: { page?: number; limit?: number; status?: string } = {}): Promise<PaginatedResult<Gate>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 30;
  const offset = (page - 1) * limit;
  let query = serverSupabase()
    .from("MonetizationGate")
    .select("id, round, publicToken, status, attempts, createdAt, verifiedAt, unlockAt, expiresAt, User:userId(id, phone, name), Session:sessionId(id, inviteCode, status, Category:categoryId(name)), Provider:providerId(id, name)", { count: "exact" });
  if (params.status) query = query.eq("status", params.status);
  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    user: r.User ?? undefined,
    session: r.Session ? { ...r.Session as Record<string, unknown>, category: (r.Session as Record<string, unknown>).Category } : undefined,
    provider: r.Provider ?? undefined,
  })) as unknown as Gate[];
  return paginate(items, page, limit, count ?? 0);
}

// ── Events ────────────────────────────────────────────────────

export async function listMonetizationEvents(params: { page?: number; limit?: number; type?: string } = {}): Promise<PaginatedResult<GateEvent>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 30;
  const offset = (page - 1) * limit;
  let query = serverSupabase()
    .from("MonetizationEvent")
    .select("id, type, status, metadata, createdAt, placement, User:userId(id, phone, name), Session:sessionId(id, inviteCode), Provider:providerId(id, name)", { count: "exact" });
  if (params.type) query = query.eq("type", params.type);
  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const items = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    ...r,
    user: r.User ?? undefined,
    session: r.Session ?? undefined,
    provider: r.Provider ?? undefined,
  })) as unknown as GateEvent[];
  return paginate(items, page, limit, count ?? 0);
}
