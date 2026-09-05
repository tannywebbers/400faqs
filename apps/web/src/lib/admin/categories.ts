"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, slugify, audit, paginate, type PaginatedResult } from "./shared";

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  rules: string | null;
  icon: string;
  color: string;
  gameType: string;
  status: "ACTIVE" | "ARCHIVED";
  trending: boolean;
  questionCount: number;
  playCount: number;
  createdAt: string;
};

export type CategoryListParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  sort?: string;
};

export async function listCategories(params: CategoryListParams = {}): Promise<PaginatedResult<Category>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("Category")
    .select("*", { count: "exact" });

  if (params.q) {
    query = query.or(`name.ilike.%${params.q}%,description.ilike.%${params.q}%`);
  }
  const s = (params.status ?? "").toLowerCase();
  if (s === "active") query = query.eq("status", "ACTIVE");
  if (s === "archived") query = query.eq("status", "ARCHIVED");

  switch (params.sort) {
    case "name":
      query = query.order("name", { ascending: true });
      break;
    case "play_count":
      query = query.order("playCount", { ascending: false });
      break;
    case "question_count":
      query = query.order("questionCount", { ascending: false });
      break;
    default:
      query = query.order("createdAt", { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return paginate((data ?? []) as Category[], page, limit, count ?? 0);
}

export async function listAllCategoriesSimple(): Promise<{ id: string; name: string }[]> {
  await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("Category")
    .select("id, name")
    .order("name", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

export type CategoryInput = {
  name: string;
  description: string;
  rules?: string | null;
  icon?: string;
  color?: string;
  gameType?: string;
  status?: "ACTIVE" | "ARCHIVED";
  trending?: boolean;
};

export async function createCategory(input: CategoryInput): Promise<Category> {
  const admin = await requireAdmin();
  const slug = slugify(input.name);

  const { data: existing } = await serverSupabase()
    .from("Category")
    .select("id")
    .or(`slug.eq.${slug},name.ilike.${input.name}`)
    .limit(1);
  if (existing && existing.length > 0) throw new Error("A category with this name already exists");

  const { data, error } = await serverSupabase()
    .from("Category")
    .insert({
      name: input.name,
      slug,
      description: input.description,
      rules: input.rules ?? null,
      icon: input.icon ?? "Sparkles",
      color: input.color ?? "#2F80ED",
      gameType: input.gameType ?? "NORMAL",
      status: input.status ?? "ACTIVE",
      trending: input.trending ?? false,
      createdById: admin.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(admin.id, "CREATE", "category", data.id, { name: data.name });
  return data as Category;
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Category> {
  const admin = await requireAdmin();
  const slug = slugify(input.name);

  const { data: existing } = await serverSupabase()
    .from("Category")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Category not found");

  const { data: clash } = await serverSupabase()
    .from("Category")
    .select("id")
    .or(`slug.eq.${slug},name.ilike.${input.name}`)
    .neq("id", id)
    .limit(1);
  if (clash && clash.length > 0) throw new Error("A category with this name already exists");

  const { data, error } = await serverSupabase()
    .from("Category")
    .update({
      name: input.name,
      slug,
      description: input.description,
      rules: input.rules ?? null,
      icon: input.icon ?? "Sparkles",
      color: input.color ?? "#2F80ED",
      gameType: input.gameType ?? "NORMAL",
      status: input.status ?? "ACTIVE",
      trending: input.trending ?? false,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(admin.id, "UPDATE", "category", data.id, { name: data.name });
  return data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("Category")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Category not found");

  await serverSupabase().from("Category").delete().eq("id", id);
  await audit(admin.id, "DELETE", "category", id, { name: existing.name });
}

export async function archiveCategory(id: string): Promise<Category> {
  const admin = await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("Category")
    .update({ status: "ARCHIVED" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "ARCHIVE", "category", id);
  return data as Category;
}
