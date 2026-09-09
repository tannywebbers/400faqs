"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, audit, paginate, type PaginatedResult } from "./shared";

export type Question = {
  id: string;
  text: string;
  type: "TRUTH" | "DARE" | "NORMAL";
  status: "PENDING" | "APPROVED" | "REJECTED";
  source: "COMMUNITY" | "ADMIN";
  difficulty: number;
  playsCount: number;
  reportCount: number;
  number: number | null;
  rejectionReason: string | null;
  createdAt: string;
  category: { id: string; name: string; slug: string; color: string };
  contributor: { phone: string; name: string | null } | null;
  reviewedBy: { name: string } | null;
};

export type QuestionListParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  category?: string;
  type?: string;
};

export async function listQuestions(params: QuestionListParams = {}): Promise<PaginatedResult<Question>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("Question")
    .select(
      "id, text, type, status, source, difficulty, playsCount, reportCount, number, rejectionReason, createdAt, categoryId, contributorId, reviewedById, Category!inner(id, name, slug, color), User:contributorId(phone, name), Admin:reviewedById(name)",
      { count: "exact" },
    );

  if (params.q) query = query.ilike("text", `%${params.q}%`);
  if (params.status) query = query.eq("status", params.status);
  if (params.category) query = query.eq("categoryId", params.category);
  if (params.type) query = query.eq("type", params.type);

  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    text: r.text,
    type: r.type,
    status: r.status,
    source: r.source,
    difficulty: r.difficulty,
    playsCount: r.playsCount,
    reportCount: r.reportCount,
    number: r.number,
    rejectionReason: r.rejectionReason,
    createdAt: r.createdAt,
    category: (r.Category as Record<string, string>) ?? { id: "", name: "", slug: "", color: "" },
    contributor: r.User ?? null,
    reviewedBy: r.Admin ?? null,
  })) as Question[];

  return paginate(items, page, limit, count ?? 0);
}

export type QuestionInput = {
  text: string;
  type: "TRUTH" | "DARE" | "NORMAL";
  categoryId: string;
  difficulty?: number;
  status?: "PENDING" | "APPROVED" | "REJECTED";
};

/** Smallest positive integer not yet used by a question in the category. */
async function nextFreeNumber(categoryId: string): Promise<number> {
  const { data } = await serverSupabase()
    .from("Question")
    .select("number")
    .eq("categoryId", categoryId);
  const used = new Set((data ?? []).map((r) => r.number).filter((n): n is number => n !== null));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

export async function createQuestion(input: QuestionInput): Promise<Question> {
  const admin = await requireAdmin();

  const { data: category } = await serverSupabase()
    .from("Category")
    .select("id")
    .eq("id", input.categoryId)
    .single();
  if (!category) throw new Error("Category not found");

  const number = await nextFreeNumber(input.categoryId);
  const { data, error } = await serverSupabase()
    .from("Question")
    .insert({
      text: input.text,
      type: input.type,
      categoryId: input.categoryId,
      number,
      difficulty: input.difficulty ?? 1,
      status: input.status ?? "APPROVED",
      source: "ADMIN",
      reviewedById: admin.id,
      reviewedAt: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await serverSupabase()
    .from("Category")
    .update({ questionCount: (await serverSupabase().from("Question").select("*", { count: "exact", head: true }).eq("categoryId", input.categoryId).eq("status", "APPROVED")).count ?? 0 })
    .eq("id", input.categoryId);

  await audit(admin.id, "CREATE", "question", data.id, { text: data.text.slice(0, 80) });
  return data as unknown as Question;
}

export async function reviewQuestion(
  id: string,
  status: "APPROVED" | "REJECTED",
  rejectionReason?: string,
): Promise<Question> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("Question")
    .select("*")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Question not found");

  const update: Record<string, unknown> = {
    status,
    reviewedById: admin.id,
    reviewedAt: new Date().toISOString(),
  };
  if (status === "REJECTED") {
    update.rejectionReason = rejectionReason ?? null;
  } else {
    update.rejectionReason = null;
    if (!existing.number) {
      update.number = await nextFreeNumber(existing.categoryId);
    }
  }

  const { data, error } = await serverSupabase()
    .from("Question")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  // Update category questionCount
  const approvedCount = await serverSupabase()
    .from("Question")
    .select("*", { count: "exact", head: true })
    .eq("categoryId", existing.categoryId)
    .eq("status", "APPROVED");
  await serverSupabase()
    .from("Category")
    .update({ questionCount: approvedCount.count ?? 0 })
    .eq("id", existing.categoryId);

  await audit(admin.id, "REVIEW", "question", id, { status });
  return data as unknown as Question;
}

export async function updateQuestion(id: string, input: QuestionInput): Promise<Question> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("Question")
    .select("id")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Question not found");

  const { data, error } = await serverSupabase()
    .from("Question")
    .update({
      text: input.text,
      type: input.type,
      categoryId: input.categoryId,
      difficulty: input.difficulty ?? 1,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(admin.id, "UPDATE", "question", id);
  return data as unknown as Question;
}

export async function deleteQuestion(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("Question")
    .select("id, text, status, categoryId")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Question not found");

  await serverSupabase().from("Question").delete().eq("id", id);

  // Update category questionCount
  const approvedCount = await serverSupabase()
    .from("Question")
    .select("*", { count: "exact", head: true })
    .eq("categoryId", existing.categoryId)
    .eq("status", "APPROVED");
  await serverSupabase()
    .from("Category")
    .update({ questionCount: approvedCount.count ?? 0 })
    .eq("id", existing.categoryId);

  await audit(admin.id, "DELETE", "question", id, { text: existing.text.slice(0, 80) });
}
