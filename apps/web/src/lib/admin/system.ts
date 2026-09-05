"use server";

import bcrypt from "bcryptjs";
import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit, paginate, type PaginatedResult } from "./shared";

// ── Notifications ──────────────────────────────────────────────────────

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationListResult = Notification[] & {
  total?: number;
  totalPages?: number;
  unread?: number;
};

export async function listNotifications(params: { page?: number; limit?: number } = {}): Promise<NotificationListResult> {
  const admin = await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  const { data, error, count } = await serverSupabase()
    .from("Notification")
    .select("*", { count: "exact" })
    .eq("adminId", admin.id)
    .order("createdAt", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const { count: unread } = await serverSupabase()
    .from("Notification")
    .select("*", { count: "exact", head: true })
    .eq("adminId", admin.id)
    .is("readAt", null);

  return Object.assign((data ?? []) as Notification[], {
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / limit),
    unread: unread ?? 0,
  });
}

export async function getUnreadNotificationCount(): Promise<{ count: number }> {
  const admin = await requireAdmin();
  const { count } = await serverSupabase()
    .from("Notification")
    .select("*", { count: "exact", head: true })
    .eq("adminId", admin.id)
    .is("readAt", null);
  return { count: count ?? 0 };
}

export async function markNotificationRead(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("Notification")
    .select("id, adminId")
    .eq("id", id)
    .single();
  if (!existing || existing.adminId !== admin.id) throw new Error("Notification not found");
  await serverSupabase().from("Notification").update({ readAt: new Date().toISOString() }).eq("id", id);
}

export async function markAllNotificationsRead(): Promise<void> {
  const admin = await requireAdmin();
  await serverSupabase()
    .from("Notification")
    .update({ readAt: new Date().toISOString() })
    .eq("adminId", admin.id)
    .is("readAt", null);
}

// ── Audit Log ─────────────────────────────────────────────────────────

export type AuditLogEntry = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  admin: { name: string; email: string };
};

export async function listAuditLogs(params: { page?: number; limit?: number; q?: string; action?: string; adminId?: string } = {}): Promise<PaginatedResult<AuditLogEntry>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("AuditLog")
    .select("id, action, targetType, targetId, details, createdAt, adminId, Admin!inner(name, email)", { count: "exact" });

  if (params.q) {
    query = query.or(`action.ilike.%${params.q}%,targetType.ilike.%${params.q}%`);
  }
  if (params.action) query = query.eq("action", params.action);
  if (params.adminId) query = query.eq("adminId", params.adminId);

  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    details: r.details,
    createdAt: r.createdAt,
    admin: r.Admin ?? { name: "", email: "" },
  })) as AuditLogEntry[];

  return paginate(items, page, limit, count ?? 0);
}

export async function getAuditActions(): Promise<{ action: string; count: number }[]> {
  await requireAdmin();
  const { data, error } = await serverSupabase().from("AuditLog").select("action");
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    map.set(r.action, (map.get(r.action) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([action, count]) => ({ action, count }));
}

// ── Admins ────────────────────────────────────────────────────────────

export type AdminRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export async function listAdmins(params: { page?: number; limit?: number; q?: string } = {}): Promise<PaginatedResult<AdminRow>> {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("Admin")
    .select("id, name, email, role, active, lastLoginAt, createdAt", { count: "exact" });

  if (params.q) {
    query = query.or(`name.ilike.%${params.q}%,email.ilike.%${params.q}%`);
  }
  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return paginate((data ?? []) as AdminRow[], page, limit, count ?? 0);
}

export async function createAdmin(input: { name: string; email: string; password?: string; role?: string; active?: boolean }): Promise<AdminRow> {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN") throw new Error("Forbidden");

  const { data: existing } = await serverSupabase()
    .from("Admin")
    .select("id")
    .eq("email", input.email.toLowerCase())
    .single();
  if (existing) throw new Error("An admin with that email already exists");

  const hash = await bcrypt.hash(input.password ?? "change-me-1234", 12);
  const { data, error } = await serverSupabase()
    .from("Admin")
    .insert({
      name: input.name,
      email: input.email.toLowerCase(),
      password: hash,
      role: input.role ?? "ADMIN",
      active: input.active ?? true,
    })
    .select("id, name, email, role, active")
    .single();
  if (error) throw new Error(error.message);

  await audit(admin.id, "CREATE", "admin", data.id, { email: data.email });
  return data as AdminRow;
}

export async function updateAdmin(id: string, input: { name?: string; role?: string; active?: boolean; password?: string }): Promise<AdminRow> {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN") throw new Error("Forbidden");

  const { data: existing } = await serverSupabase()
    .from("Admin")
    .select("id, email")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Admin not found");
  if (existing.id === admin.id && input.active === false) throw new Error("You cannot disable your own account");

  const update: Record<string, unknown> = {};
  if (input.name) update.name = input.name;
  if (input.role) update.role = input.role;
  if (typeof input.active === "boolean") update.active = input.active;
  if (input.password) update.password = await bcrypt.hash(input.password, 12);

  const { data, error } = await serverSupabase()
    .from("Admin")
    .update(update)
    .eq("id", id)
    .select("id, name, email, role, active")
    .single();
  if (error) throw new Error(error.message);

  await audit(admin.id, "UPDATE", "admin", id, { fields: Object.keys(update) });
  return data as AdminRow;
}

export async function deleteAdmin(id: string): Promise<void> {
  const admin = await requireAdmin();
  if (admin.role !== "SUPER_ADMIN") throw new Error("Forbidden");

  const { data: existing } = await serverSupabase()
    .from("Admin")
    .select("id")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Admin not found");
  if (existing.id === admin.id) throw new Error("You cannot delete your own account");

  await serverSupabase().from("Admin").delete().eq("id", id);
  await audit(admin.id, "DELETE", "admin", id);
}

// ── Health / System ───────────────────────────────────────────────────

export type HealthCounts = {
  users: number;
  categories: number;
  questions: number;
  pendingQuestions: number;
  contributions: number;
  pendingContributions: number;
  sessions: number;
  activeSessions: number;
  openReports: number;
  pendingRequests: number;
  pendingNotifications: number;
};

export async function getHealthCounts(): Promise<HealthCounts> {
  await requireAdmin();
  const sb = serverSupabase();
  const count = (table: string, filter?: Record<string, unknown>) =>
    sb.from(table).select("*", { count: "exact", head: true }).match(filter ?? {});

  const [users, categories, questions, pendingQuestions, contributions, pendingContributions, sessions, activeSessions, openReports, pendingRequests, pendingNotifications] = await Promise.all([
    count("User"), count("Category"), count("Question"), count("Question", { status: "PENDING" }),
    count("Contribution"), count("Contribution", { status: "PENDING" }),
    count("Session"), count("Session", { status: "ACTIVE" }),
    count("QuestionReport", { status: "OPEN" }),
    count("CategoryRequest", { status: "PENDING" }),
    count("Notification", { status: "PENDING" }),
  ]);

  return {
    users: users.count ?? 0,
    categories: categories.count ?? 0,
    questions: questions.count ?? 0,
    pendingQuestions: pendingQuestions.count ?? 0,
    contributions: contributions.count ?? 0,
    pendingContributions: pendingContributions.count ?? 0,
    sessions: sessions.count ?? 0,
    activeSessions: activeSessions.count ?? 0,
    openReports: openReports.count ?? 0,
    pendingRequests: pendingRequests.count ?? 0,
    pendingNotifications: pendingNotifications.count ?? 0,
  };
}

export async function getSystemEvents(limit = 50): Promise<{ events: { id: string; component: string; status: string; message: string; createdAt: string }[]; unhealthy: number }> {
  await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("SystemEvent")
    .select("id, component, status, message, createdAt")
    .order("createdAt", { ascending: false })
    .limit(Math.min(limit, 200));
  if (error) throw new Error(error.message);

  const { count: unhealthy } = await serverSupabase()
    .from("SystemEvent")
    .select("*", { count: "exact", head: true })
    .in("status", ["degraded", "down"]);

  return { events: (data ?? []) as { id: string; component: string; status: string; message: string; createdAt: string }[], unhealthy: unhealthy ?? 0 };
}

// ── Jobs ──────────────────────────────────────────────────────────────

export async function listJobs(): Promise<{ queues: Record<string, unknown>; recent: unknown[] }> {
  await requireAdmin();
  // No BullMQ in Supabase migration — return empty
  return { queues: {}, recent: [] };
}
