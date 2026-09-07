"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit } from "./shared";

export type LogoStatus = { hasLogo: boolean; mime?: string; size?: number; updatedAt?: string };

export async function getLogoStatus(): Promise<LogoStatus> {
  await requireAdmin();
  try {
    const { data, error } = await serverSupabase()
      .from("SiteAsset")
      .select("mime, size, updatedAt")
      .eq("key", "logo")
      .single();
    if (error || !data) return { hasLogo: false };
    return { hasLogo: true, ...(data as Record<string, unknown>) } as LogoStatus;
  } catch {
    return { hasLogo: false };
  }
}

export async function uploadLogo(file: File): Promise<LogoStatus> {
  const admin = await requireAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  const { data, error } = await serverSupabase()
    .from("SiteAsset")
    .upsert(
      { key: "logo", mime: file.type, size: file.size, data: base64 },
      { onConflict: "key" },
    )
    .select("mime, size, updatedAt")
    .single();
  if (error) throw new Error(error.message);

  await serverSupabase()
    .from("Setting")
    .upsert(
      { key: "site.logo_blob", value: "1", public: true, group: "general" },
      { onConflict: "key" },
    );

  await audit(admin.id, "UPDATE", "site_asset", "logo", { mime: file.type, size: file.size });
  return { hasLogo: true, ...(data as Record<string, unknown>) } as LogoStatus;
}

export async function deleteLogo(): Promise<void> {
  const admin = await requireAdmin();
  await serverSupabase().from("SiteAsset").delete().eq("key", "logo");
  await serverSupabase()
    .from("Setting")
    .upsert(
      { key: "site.logo_blob", value: "0", public: true, group: "general" },
      { onConflict: "key" },
    );
  await audit(admin.id, "DELETE", "site_asset", "logo");
}
