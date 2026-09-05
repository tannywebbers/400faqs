"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, slugify, audit, paginate, type PaginatedResult } from "./shared";

// ── FAQs ──────────────────────────────────────────────────────────────

export type Faq = {
  id: string;
  question: string;
  answer: string;
  order: number;
  status: boolean;
  createdAt: string;
};

export type FaqListParams = { page?: number; limit?: number; q?: string; status?: string };

export async function listFaqs(params: FaqListParams = {}): Promise<PaginatedResult<Faq>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;

  let query = serverSupabase().from("Faq").select("*", { count: "exact" });
  if (params.q) {
    query = query.or(`question.ilike.%${params.q}%,answer.ilike.%${params.q}%`);
  }
  if (params.status === "active") query = query.eq("status", true);
  if (params.status === "inactive") query = query.eq("status", false);

  query = query.order("order", { ascending: true }).order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return paginate((data ?? []) as Faq[], page, limit, count ?? 0);
}

export type FaqInput = { question: string; answer: string; order?: number; status?: boolean };

export async function createFaq(input: FaqInput): Promise<Faq> {
  const admin = await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("Faq")
    .insert({
      question: input.question,
      answer: input.answer,
      order: input.order ?? 0,
      status: input.status ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "CREATE", "faq", data.id);
  return data as Faq;
}

export async function updateFaq(id: string, input: FaqInput): Promise<Faq> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase().from("Faq").select("id").eq("id", id).single();
  if (!existing) throw new Error("FAQ not found");
  const { data, error } = await serverSupabase()
    .from("Faq")
    .update({
      question: input.question,
      answer: input.answer,
      order: input.order ?? 0,
      status: input.status ?? true,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "UPDATE", "faq", id);
  return data as Faq;
}

export async function deleteFaq(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase().from("Faq").select("id").eq("id", id).single();
  if (!existing) throw new Error("FAQ not found");
  await serverSupabase().from("Faq").delete().eq("id", id);
  await audit(admin.id, "DELETE", "faq", id);
}

// ── Help Articles ─────────────────────────────────────────────────────

export type Article = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  order: number;
  status: boolean;
  createdAt: string;
};

export type ArticleListParams = { page?: number; limit?: number; q?: string; status?: string };

export async function listArticles(params: ArticleListParams = {}): Promise<PaginatedResult<Article>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;

  let query = serverSupabase().from("HelpArticle").select("*", { count: "exact" });
  if (params.q) {
    query = query.or(`title.ilike.%${params.q}%,content.ilike.%${params.q}%`);
  }
  if (params.status === "active") query = query.eq("status", true);
  if (params.status === "inactive") query = query.eq("status", false);

  query = query.order("order", { ascending: true }).order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return paginate((data ?? []) as Article[], page, limit, count ?? 0);
}

export type ArticleInput = {
  title: string;
  excerpt: string;
  content: string;
  category?: string;
  order?: number;
  status?: boolean;
};

export async function createArticle(input: ArticleInput): Promise<Article> {
  const admin = await requireAdmin();
  const slug = slugify(input.title);
  const { data, error } = await serverSupabase()
    .from("HelpArticle")
    .insert({
      title: input.title,
      slug,
      excerpt: input.excerpt,
      content: input.content,
      category: input.category ?? "General",
      order: input.order ?? 0,
      status: input.status ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "CREATE", "article", data.id);
  return data as Article;
}

export async function updateArticle(id: string, input: ArticleInput): Promise<Article> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase().from("HelpArticle").select("id").eq("id", id).single();
  if (!existing) throw new Error("Article not found");
  const slug = slugify(input.title);
  const { data, error } = await serverSupabase()
    .from("HelpArticle")
    .update({
      title: input.title,
      slug,
      excerpt: input.excerpt,
      content: input.content,
      category: input.category ?? "General",
      order: input.order ?? 0,
      status: input.status ?? true,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "UPDATE", "article", id);
  return data as Article;
}

export async function deleteArticle(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase().from("HelpArticle").select("id").eq("id", id).single();
  if (!existing) throw new Error("Article not found");
  await serverSupabase().from("HelpArticle").delete().eq("id", id);
  await audit(admin.id, "DELETE", "article", id);
}

// ── Settings ──────────────────────────────────────────────────────────

export type SettingRow = {
  key: string;
  value: string;
  type: string;
  group: string;
  description: string | null;
  public: boolean;
};

export async function getAllSettings(): Promise<SettingRow[]> {
  await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("Setting")
    .select("key, value, type, group, description, public")
    .order("group", { ascending: true })
    .order("key", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SettingRow[];
}

export async function updateSettings(entries: { key: string; value: string; public?: boolean; group?: string; description?: string | null }[]): Promise<void> {
  const admin = await requireAdmin();
  for (const entry of entries) {
    const { data: existing } = await serverSupabase()
      .from("Setting")
      .select("key")
      .eq("key", entry.key)
      .single();

    if (existing) {
      const update: Record<string, unknown> = { value: entry.value };
      if (entry.public !== undefined) update.public = entry.public;
      if (entry.group !== undefined) update.group = entry.group;
      if (entry.description !== undefined) update.description = entry.description;
      await serverSupabase().from("Setting").update(update).eq("key", entry.key);
    } else {
      await serverSupabase().from("Setting").insert({
        key: entry.key,
        value: entry.value,
        type: "string",
        group: entry.group ?? "general",
        description: entry.description ?? null,
        public: entry.public ?? false,
      });
    }
  }
  await audit(admin.id, "UPDATE", "settings", undefined, { keys: entries.map((e) => e.key) });
}
