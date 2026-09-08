"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit } from "./shared";

export type LogoStatus = { hasLogo: boolean; mime?: string; size?: number; updatedAt?: string };

const BUCKET = "logos";
const FILE_KEY = "logo";

async function ensureBucket(): Promise<void> {
  const sb = serverSupabase();
  const { data: buckets } = await sb.storage.listBuckets();
  const exists = (buckets ?? []).some((b) => b.name === BUCKET);
  if (!exists) {
    await sb.storage.createBucket(BUCKET, { public: true });
  }
}

export async function getLogoStatus(): Promise<LogoStatus> {
  await requireAdmin();
  try {
    const sb = serverSupabase();
    const { data, error } = await sb.storage.from(BUCKET).list("", { search: FILE_KEY });
    if (error || !data) return { hasLogo: false };
    const file = data.find((f) => f.name === FILE_KEY);
    if (!file) return { hasLogo: false };
    return {
      hasLogo: true,
      size: file.metadata?.size,
      mime: file.metadata?.mimetype,
      updatedAt: file.updated_at ?? file.created_at,
    };
  } catch {
    return { hasLogo: false };
  }
}

export async function uploadLogo(file: File): Promise<LogoStatus> {
  const admin = await requireAdmin();
  await ensureBucket();

  const sb = serverSupabase();
  const { error: uploadError } = await sb.storage
    .from(BUCKET)
    .upload(FILE_KEY, file, { upsert: true, contentType: file.type });

  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(FILE_KEY);
  const publicUrl = urlData.publicUrl;

  // Store the public URL in settings so brand-logo.tsx uses it directly
  await sb
    .from("Setting")
    .upsert(
      { key: "site.logo", value: publicUrl, public: true, group: "general" },
      { onConflict: "key" },
    );
  await sb
    .from("Setting")
    .upsert(
      { key: "site.logo_blob", value: "0", public: true, group: "general" },
      { onConflict: "key" },
    );

  await audit(admin.id, "UPDATE", "site_asset", "logo", { mime: file.type, size: file.size, storage: BUCKET });
  return { hasLogo: true, mime: file.type, size: file.size, updatedAt: new Date().toISOString() };
}

export async function deleteLogo(): Promise<void> {
  const admin = await requireAdmin();
  const sb = serverSupabase();
  await sb.storage.from(BUCKET).remove([FILE_KEY]);
  await sb
    .from("Setting")
    .upsert(
      { key: "site.logo", value: "", public: true, group: "general" },
      { onConflict: "key" },
    );
  await sb
    .from("Setting")
    .upsert(
      { key: "site.logo_blob", value: "0", public: true, group: "general" },
      { onConflict: "key" },
    );
  await audit(admin.id, "DELETE", "site_asset", "logo");
}
