"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit, paginate, type PaginatedResult } from "./shared";

export type WhatsAppStatus = {
  configured: boolean;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  graphVersion: string;
  apiBase: string;
  appId: string;
  maskedToken: string;
  maskedSecret: string;
  source: "env" | "database";
  connection: { connected: boolean; phoneInfo?: { verifiedName?: string; displayPhoneNumber?: string }; error?: string };
  stats: { activeSessions: number; messagesInbound: number; messagesOutbound: number; totalMessages: number };
  botNumber?: string;
  publicStartLink?: string | null;
  monetizationEnabled?: boolean;
  webhookUrl: string;
};

export type MessageTemplate = {
  id: string;
  name: string;
  category: string;
  language: string;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: unknown;
  status: string;
  metaStatus: string | null;
  metaRejectionReason: string | null;
  waTemplateId: string | null;
  metaUpdatedAt: string | null;
  usageCount: number;
  createdAt: string;
};

export type TemplateStats = {
  total: number;
  draft: number;
  active: number;
  submitted: number;
  approved: number;
  rejected: number;
  archived: number;
  synced: number;
};

export type MessageLogEntry = {
  id: string;
  direction: string;
  phone: string;
  type: string;
  status: string;
  content: Record<string, unknown>;
  error: string | null;
  createdAt: string;
};

export type WhatsAppSession = {
  id: string;
  inviteCode: string;
  status: string;
  creator: { phone: string; name: string | null };
  joiner: { phone: string; name: string | null } | null;
  category: { name: string } | null;
  _count: { moves: number };
  createdAt: string;
};

async function readSettings(keys: string[]): Promise<Record<string, string>> {
  const { data } = await serverSupabase().from("Setting").select("key, value").in("key", keys);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.key] = row.value;
  }
  return map;
}

function mask(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••••••" + value.slice(-4);
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  await requireAdmin();
  const s = await readSettings([
    "whatsapp.accessToken", "whatsapp.phoneNumberId", "whatsapp.businessAccountId",
    "whatsapp.appId", "whatsapp.appSecret", "whatsapp.graphVersion", "whatsapp.apiBase",
    "whatsapp.webhookVerifyToken", "whatsapp.number", "monetization.enabled",
    "whatsapp.webhookBase",
  ]);

  const [sessions, messagesInbound, messagesOutbound] = await Promise.all([
    serverSupabase().from("Session").select("*", { count: "exact", head: true }).in("status", ["WAITING", "ACTIVE"]),
    serverSupabase().from("MessageLog").select("*", { count: "exact", head: true }).eq("direction", "inbound"),
    serverSupabase().from("MessageLog").select("*", { count: "exact", head: true }).eq("direction", "outbound"),
  ]);

  const botNumber = s["whatsapp.number"] ?? "";
  const publicStartLink = botNumber
    ? `https://wa.me/${botNumber.replace(/\D/g, "")}?text=${encodeURIComponent("START")}`
    : null;
  const webhookBase = s["whatsapp.webhookBase"] ?? "";
  const webhookUrl = webhookBase ? `${webhookBase}/api/whatsapp/webhook` : "";
  const hasToken = !!s["whatsapp.accessToken"];

  return {
    configured: hasToken,
    phoneNumberId: s["whatsapp.phoneNumberId"] ?? "",
    businessAccountId: s["whatsapp.businessAccountId"] ?? "",
    webhookVerifyToken: s["whatsapp.webhookVerifyToken"] ?? "",
    graphVersion: s["whatsapp.graphVersion"] ?? "v18.0",
    apiBase: s["whatsapp.apiBase"] ?? "https://graph.facebook.com",
    appId: s["whatsapp.appId"] ?? "",
    maskedToken: mask(s["whatsapp.accessToken"] ?? ""),
    maskedSecret: mask(s["whatsapp.appSecret"] ?? ""),
    source: "database",
    connection: { connected: hasToken, error: hasToken ? undefined : "Not configured" },
    stats: {
      activeSessions: sessions.count ?? 0,
      messagesInbound: messagesInbound.count ?? 0,
      messagesOutbound: messagesOutbound.count ?? 0,
      totalMessages: (messagesInbound.count ?? 0) + (messagesOutbound.count ?? 0),
    },
    botNumber,
    publicStartLink,
    monetizationEnabled: ["1", "true", "yes", "on"].includes((s["monetization.enabled"] ?? "").toLowerCase()),
    webhookUrl,
  };
}

export async function listMessageTemplates(params: { page?: number; limit?: number; status?: string; q?: string } = {}): Promise<PaginatedResult<MessageTemplate>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 100;
  const offset = (page - 1) * limit;

  let query = serverSupabase().from("MessageTemplate").select("*", { count: "exact" });
  if (params.status) query = query.eq("status", params.status);
  if (params.q) query = query.or(`name.ilike.%${params.q}%,body.ilike.%${params.q}%`);
  query = query.order("updatedAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return paginate((data ?? []) as unknown as MessageTemplate[], page, limit, count ?? 0);
}

export async function getTemplateStats(): Promise<TemplateStats> {
  await requireAdmin();
  const { data, error } = await serverSupabase().from("MessageTemplate").select("status, waTemplateId");
  if (error) throw new Error(error.message);
  const stats: TemplateStats = { total: 0, draft: 0, active: 0, submitted: 0, approved: 0, rejected: 0, archived: 0, synced: 0 };
  for (const r of data ?? []) {
    stats.total++;
    const row = r as Record<string, unknown>;
    const st = row.status as string;
    if (st === "APPROVED") stats.approved++;
    else if (st === "PENDING" || st === "SUBMITTED") stats.submitted++;
    else if (st === "REJECTED") stats.rejected++;
    else if (st === "ARCHIVED") stats.archived++;
    else stats.draft++;
    if (row.waTemplateId) stats.synced++;
  }
  return stats;
}

export async function listMessageLogs(params: { page?: number; limit?: number; direction?: string; phone?: string; status?: string } = {}): Promise<PaginatedResult<MessageLogEntry>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 30;
  const offset = (page - 1) * limit;

  let query = serverSupabase().from("MessageLog").select("*", { count: "exact" });
  if (params.direction) query = query.eq("direction", params.direction);
  if (params.phone) query = query.eq("phone", params.phone);
  if (params.status) query = query.eq("status", params.status);
  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return paginate((data ?? []) as unknown as MessageLogEntry[], page, limit, count ?? 0);
}

export async function listWhatsAppSessions(params: { page?: number; limit?: number; status?: string } = {}): Promise<PaginatedResult<WhatsAppSession>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("Session")
    .select("id, inviteCode, status, createdAt, Creator:creatorId(phone, name), Joiner:joinerId(phone, name), Category:categoryId(name), GameMove:sessionId(id)", { count: "exact" });
  if (params.status) query = query.eq("status", params.status);
  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id, inviteCode: r.inviteCode, status: r.status, createdAt: r.createdAt,
    creator: r.Creator ?? { phone: "", name: null },
    joiner: r.Joiner ?? null,
    category: r.Category ?? null,
    _count: { moves: Array.isArray(r.GameMove) ? r.GameMove.length : 0 },
  })) as WhatsAppSession[];

  return paginate(items, page, limit, count ?? 0);
}

export async function updateWhatsAppConfig(input: Record<string, string>): Promise<void> {
  const admin = await requireAdmin();
  const keys: Record<string, string> = {
    accessToken: "whatsapp.accessToken",
    phoneNumberId: "whatsapp.phoneNumberId",
    businessAccountId: "whatsapp.businessAccountId",
    appId: "whatsapp.appId",
    appSecret: "whatsapp.appSecret",
    graphVersion: "whatsapp.graphVersion",
    apiBase: "whatsapp.apiBase",
    webhookVerifyToken: "whatsapp.webhookVerifyToken",
  };
  for (const [field, settingKey] of Object.entries(keys)) {
    if (input[field] !== undefined && input[field] !== "") {
      await serverSupabase().from("Setting").upsert({ key: settingKey, value: input[field], group: "whatsapp" }, { onConflict: "key" });
    }
  }
  await audit(admin.id, "WHATSAPP_CONFIG_UPDATE", "whatsapp", undefined, { fields: Object.keys(input) });
}
