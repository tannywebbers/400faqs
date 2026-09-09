import { cookies } from "next/headers";
import { serverSupabase } from "@/lib/supabase";

export type AdminSession = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const SESSION_COOKIE = "admin_session";

/** Read the admin session cookie and verify the admin still exists + is active. */
export async function requireAdmin(): Promise<AdminSession> {
  const cookieStore = cookies();
  const adminId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!adminId) throw new Error("Unauthorized");

  const { data, error } = await serverSupabase()
    .from("Admin")
    .select("id, name, email, role, active")
    .eq("id", adminId)
    .single();

  if (error || !data || !data.active) throw new Error("Unauthorized");
  return { id: data.id, name: data.name, email: data.email, role: data.role };
}

/** Like requireAdmin but returns null instead of throwing. */
export async function getOptionalAdmin(): Promise<AdminSession | null> {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

export function setSessionCookie(adminId: string): void {
  cookies().set(SESSION_COOKIE, adminId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Insert an audit log entry. */
export async function audit(
  adminId: string,
  action: string,
  targetType: string,
  targetId?: string,
  details?: Record<string, unknown>,
): Promise<void> {
  await serverSupabase().from("AuditLog").insert({
    adminId,
    action,
    targetType,
    targetId: targetId ?? null,
    details: details ?? null,
  });
}

/** Paginated list result type (matches the old API's meta shape). */
export type PaginatedResult<T> = {
  data: T[];
  page: number;
  total: number;
  totalPages: number;
};

export function paginate<T>(data: T[], page: number, limit: number, total: number): PaginatedResult<T> {
  return { data, page, limit, total, totalPages: Math.ceil(total / limit) };
}
