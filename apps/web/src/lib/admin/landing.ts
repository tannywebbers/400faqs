"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit } from "./shared";

export type LandingSection = {
  id: string;
  sectionKey: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  imageUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
  metadata: unknown;
};

export async function listLandingSections(): Promise<LandingSection[]> {
  await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("LandingContent")
    .select("*")
    .order("sortOrder", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LandingSection[];
}

export async function updateLandingSection(
  id: string,
  input: {
    title?: string | null;
    subtitle?: string | null;
    content?: string | null;
    imageUrl?: string | null;
    buttonText?: string | null;
    buttonUrl?: string | null;
    isVisible?: boolean;
  },
): Promise<LandingSection> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("LandingContent")
    .select("id, sectionKey")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Section not found");

  const update: Record<string, unknown> = {};
  if ("title" in input) update.title = input.title;
  if ("subtitle" in input) update.subtitle = input.subtitle;
  if ("content" in input) update.content = input.content;
  if ("imageUrl" in input) update.imageUrl = input.imageUrl;
  if ("buttonText" in input) update.buttonText = input.buttonText;
  if ("buttonUrl" in input) update.buttonUrl = input.buttonUrl;
  if (typeof input.isVisible === "boolean") update.isVisible = input.isVisible;

  const { data, error } = await serverSupabase()
    .from("LandingContent")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(admin.id, "UPDATE", "landing_content", id, { key: (existing as Record<string, unknown>).sectionKey });
  return data as unknown as LandingSection;
}

export async function reorderLandingSections(items: { id: string; sortOrder: number }[]): Promise<void> {
  const admin = await requireAdmin();
  for (const item of items) {
    await serverSupabase()
      .from("LandingContent")
      .update({ sortOrder: item.sortOrder })
      .eq("id", item.id);
  }
  await audit(admin.id, "UPDATE", "landing_content", "reorder", { reordered: items.map((i) => i.id) });
}
