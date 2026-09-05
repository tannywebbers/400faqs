"use server";

import bcrypt from "bcryptjs";
import { serverSupabase } from "@/lib/supabase";
import {
  requireAdmin,
  setSessionCookie,
  clearSessionCookie,
  audit,
  type AdminSession,
} from "./shared";

export async function loginAdmin(email: string, password: string): Promise<AdminSession> {
  const { data, error } = await serverSupabase()
    .from("Admin")
    .select("*")
    .eq("email", email.toLowerCase())
    .single();

  if (error || !data || !data.active) throw new Error("Invalid credentials");
  const valid = await bcrypt.compare(password, data.password);
  if (!valid) throw new Error("Invalid credentials");

  await serverSupabase()
    .from("Admin")
    .update({ lastLoginAt: new Date().toISOString() })
    .eq("id", data.id);

  await audit(data.id, "LOGIN", "admin", data.id);

  setSessionCookie(data.id);
  return { id: data.id, name: data.name, email: data.email, role: data.role };
}

export async function logoutAdmin(): Promise<void> {
  clearSessionCookie();
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const admin = await requireAdmin();
  const { data } = await serverSupabase()
    .from("Admin")
    .select("password")
    .eq("id", admin.id)
    .single();

  if (!data) throw new Error("Admin not found");
  const valid = await bcrypt.compare(currentPassword, data.password);
  if (!valid) throw new Error("Current password is incorrect");

  const hash = await bcrypt.hash(newPassword, 12);
  await serverSupabase().from("Admin").update({ password: hash }).eq("id", admin.id);
  await audit(admin.id, "CHANGE_PASSWORD", "admin", admin.id);
}
