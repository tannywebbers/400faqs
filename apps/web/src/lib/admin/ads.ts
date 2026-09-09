"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit, paginate, type PaginatedResult } from "./shared";

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
  createdAt: string;
};

export type AdPlacement = {
  id: string;
  key: string;
  name: string | null;
  description: string | null;
  providerId: string | null;
  provider: { id: string; name: string; type: string; enabled: boolean; archived: boolean } | null;
  providerPlacementId: string | null;
  format: string | null;
  enabled: boolean;
  priority: number;
  createdAt: string;
};

export type TypesMeta = { providerTypes: string[]; placements: string[]; eventTypes: string[] };

export type PerformanceReport = {
  summary: { impressions: number; clicks: number; conversions: number; verifications: number; estimated: number; confirmed: number };
  placements: { placement: string; name: string | null; enabled: boolean; provider: { id: string; name: string; type: string } | null; impressions: number; clicks: number; conversions: number; verifications: number; revenue: { estimated: number; confirmed: number } }[];
  providers: { providerId: string; name: string; type: string; enabled: boolean; impressions: number; clicks: number; conversions: number; verifications: number; ctr: number; revenue: { estimated: number; confirmed: number } }[];
};

export async function getAdTypes(): Promise<TypesMeta> {
  await requireAdmin();
  return {
    providerTypes: ["CUSTOM", "SCRIPT", "DIRECT_LINK", "ADSENSE", "ADSTERRA", "META_ADS"],
    placements: ["HOME_INLINE", "FAQ_BOTTOM", "WEB_CONTRIBUTION", "WHATSAPP_VERIFICATION", "GAME_INTERSTITIAL"],
    eventTypes: ["IMPRESSION", "CLICK", "VERIFICATION", "PAYOUT", "ADJUSTMENT"],
  };
}

export async function listAdProviders(params: { limit?: number } = {}): Promise<AdProvider[]> {
  await requireAdmin();
  const limit = params.limit ?? 1000;
  const { data, error } = await serverSupabase()
    .from("AdProvider")
    .select("id, name, type, description, enabled, archived, priority, configuration, revenueModel, currency, cpmRate, cpcRate, cpaRate, fixedPayoutPerVerification, createdAt")
    .order("priority", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AdProvider[];
}

export async function createAdProvider(input: Partial<AdProvider>): Promise<AdProvider> {
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

export async function updateAdProvider(id: string, input: Partial<AdProvider>): Promise<AdProvider> {
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

export async function toggleAdProviderStatus(id: string, enabled: boolean): Promise<AdProvider> {
  return updateAdProvider(id, { enabled });
}

export async function deleteAdProvider(id: string): Promise<void> {
  const admin = await requireAdmin();
  await serverSupabase().from("AdProvider").delete().eq("id", id);
  await audit(admin.id, "DELETE", "ad_provider", id);
}

export async function listAdPlacements(params: { limit?: number } = {}): Promise<AdPlacement[]> {
  await requireAdmin();
  const limit = params.limit ?? 1000;
  const { data, error } = await serverSupabase()
    .from("AdPlacement")
    .select("id, key, name, description, providerId, providerPlacementId, format, enabled, priority, createdAt, Provider:providerId(id, name, type, enabled, archived)")
    .order("priority", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AdPlacement[];
}

export async function createAdPlacement(input: Partial<AdPlacement>): Promise<AdPlacement> {
  const admin = await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("AdPlacement")
    .insert({
      key: input.key ?? "",
      name: input.name ?? null,
      description: input.description ?? null,
      providerId: input.providerId ?? null,
      providerPlacementId: input.providerPlacementId ?? null,
      format: input.format ?? null,
      enabled: input.enabled ?? true,
      priority: input.priority ?? 100,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "CREATE", "ad_placement", (data as Record<string, unknown>).id as string);
  return data as unknown as AdPlacement;
}

export async function updateAdPlacement(id: string, input: Partial<AdPlacement>): Promise<AdPlacement> {
  const admin = await requireAdmin();
  const update: Record<string, unknown> = {};
  for (const key of ["key", "name", "description", "providerId", "providerPlacementId", "format", "enabled", "priority"]) {
    if (key in input) update[key] = input[key as keyof AdPlacement];
  }
  const { data, error } = await serverSupabase().from("AdPlacement").update(update).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "UPDATE", "ad_placement", id);
  return data as unknown as AdPlacement;
}

export async function toggleAdPlacementStatus(id: string, enabled: boolean): Promise<AdPlacement> {
  return updateAdPlacement(id, { enabled });
}

export async function deleteAdPlacement(id: string): Promise<void> {
  const admin = await requireAdmin();
  await serverSupabase().from("AdPlacement").delete().eq("id", id);
  await audit(admin.id, "DELETE", "ad_placement", id);
}

export async function getAdPerformance(): Promise<PerformanceReport> {
  await requireAdmin();
  return {
    summary: { impressions: 0, clicks: 0, conversions: 0, verifications: 0, estimated: 0, confirmed: 0 },
    placements: [],
    providers: [],
  };
}
