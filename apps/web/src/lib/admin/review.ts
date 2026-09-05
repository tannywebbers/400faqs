"use server";

import { serverSupabase } from "@/lib/supabase";
import { requireAdmin, slugify, audit, paginate, type PaginatedResult } from "./shared";

// ── Contributions ─────────────────────────────────────────────────────

export type Contribution = {
  id: string;
  ticket: string;
  question: string;
  userPhone: string | null;
  type: "TRUTH" | "DARE" | "NORMAL";
  status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  aiScore: number | null;
  aiResult: Record<string, unknown> | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  category: { name: string; slug: string };
  duplicateOf: { text: string } | null;
  reviewedBy: { name: string } | null;
};

export type ContributionListParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  category?: string;
  ticket?: string;
};

export async function listContributions(params: ContributionListParams = {}): Promise<PaginatedResult<Contribution>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("Contribution")
    .select(
      "id, ticket, question, userPhone, type, status, aiScore, aiResult, rejectionReason, reviewedAt, createdAt, categoryId, duplicateOfId, reviewedById, Category!inner(name, slug), Question:duplicateOfId(text), Admin:reviewedById(name)",
      { count: "exact" },
    );

  if (params.q) {
    query = query.or(`question.ilike.%${params.q}%,userPhone.ilike.%${params.q}%`);
  }
  if (params.status) query = query.eq("status", params.status);
  if (params.category) query = query.eq("categoryId", params.category);
  if (params.ticket) query = query.eq("ticket", params.ticket);

  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    ticket: r.ticket,
    question: r.question,
    userPhone: r.userPhone,
    type: r.type,
    status: r.status,
    aiScore: r.aiScore,
    aiResult: r.aiResult,
    rejectionReason: r.rejectionReason,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
    category: r.Category ?? { name: "", slug: "" },
    duplicateOf: r.Question ?? null,
    reviewedBy: r.Admin ?? null,
  })) as Contribution[];

  return paginate(items, page, limit, count ?? 0);
}

export async function getContributionStats(): Promise<{ status: string; count: number }[]> {
  await requireAdmin();
  const { data, error } = await serverSupabase()
    .from("Contribution")
    .select("status");
  if (error) throw new Error(error.message);
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    map.set(r.status, (map.get(r.status) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([status, count]) => ({ status, count }));
}

export async function reviewContribution(
  id: string,
  status: "APPROVED" | "REJECTED" | "FLAGGED",
  rejectionReason?: string,
): Promise<Contribution & { blocked?: boolean; message?: string }> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("Contribution")
    .select("*")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Contribution not found");

  const update: Record<string, unknown> = {
    status,
    rejectionReason: status === "REJECTED" ? (rejectionReason ?? null) : null,
    reviewedById: admin.id,
    reviewedAt: new Date().toISOString(),
  };

  const { data, error } = await serverSupabase()
    .from("Contribution")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (status === "APPROVED") {
    // Check for exact duplicate
    const { data: dup } = await serverSupabase()
      .from("Question")
      .select("id")
      .eq("categoryId", existing.categoryId)
      .ilike("text", existing.question)
      .limit(1);

    if (dup && dup.length > 0) {
      const rejected = await serverSupabase()
        .from("Contribution")
        .update({
          status: "REJECTED",
          rejectionReason: "Duplicate of an existing question (rejected at approval)",
          reviewedById: admin.id,
          reviewedAt: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();
      await audit(admin.id, "REJECT", "contribution", id, { reason: "Exact duplicate found at approval" });
      return { ...(rejected.data as unknown as Contribution), blocked: true, message: "Rejected — an exact duplicate question already exists." };
    }

    // Create the approved question
    const { data: questions } = await serverSupabase()
      .from("Question")
      .select("number")
      .eq("categoryId", existing.categoryId);
    const used = new Set((questions ?? []).map((r) => r.number).filter((n): n is number => n !== null));
    let n = 1;
    while (used.has(n)) n++;

    await serverSupabase().from("Question").insert({
      text: existing.question,
      type: existing.type,
      categoryId: existing.categoryId,
      number: n,
      status: "APPROVED",
      source: "COMMUNITY",
      contributorId: existing.userId,
      aiScore: existing.aiScore,
    });

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

    await audit(admin.id, "APPROVE", "contribution", id);
  } else {
    await audit(admin.id, "REJECT", "contribution", id, { status });
  }

  return data as unknown as Contribution;
}

export async function deleteContribution(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("Contribution")
    .select("id")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Contribution not found");
  await serverSupabase().from("Contribution").delete().eq("id", id);
  await audit(admin.id, "DELETE", "contribution", id);
}

// ── Reports ───────────────────────────────────────────────────────────

export type Report = {
  id: string;
  ticket: string;
  reason: string;
  notes: string | null;
  screenshotUrl: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  resolution: string | null;
  reporterPhone: string;
  createdAt: string;
  updatedAt: string;
  category: { name: string; slug: string };
  question: { text: string } | null;
  resolvedBy: { name: string } | null;
};

export type ReportListParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  reason?: string;
  category?: string;
};

export async function listReports(params: ReportListParams = {}): Promise<PaginatedResult<Report>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("QuestionReport")
    .select(
      "id, ticket, reason, notes, screenshotUrl, status, resolution, reporterPhone, createdAt, updatedAt, categoryId, questionId, resolvedById, Category!inner(name, slug), Question:questionId(text), Admin:resolvedById(name)",
      { count: "exact" },
    );

  if (params.q) {
    query = query.or(`ticket.ilike.%${params.q}%,reporterPhone.ilike.%${params.q}%,notes.ilike.%${params.q}%`);
  }
  if (params.status) query = query.eq("status", params.status);
  if (params.reason) query = query.eq("reason", params.reason);
  if (params.category) query = query.eq("categoryId", params.category);

  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    ticket: r.ticket,
    reason: r.reason,
    notes: r.notes,
    screenshotUrl: r.screenshotUrl,
    status: r.status,
    resolution: r.resolution,
    reporterPhone: r.reporterPhone,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    category: r.Category ?? { name: "", slug: "" },
    question: r.Question ?? null,
    resolvedBy: r.Admin ?? null,
  })) as Report[];

  return paginate(items, page, limit, count ?? 0);
}

export async function resolveReport(
  id: string,
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED",
  resolution?: string,
): Promise<Report> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("QuestionReport")
    .select("id")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Report not found");

  const isFinal = status === "RESOLVED" || status === "DISMISSED";
  const { data, error } = await serverSupabase()
    .from("QuestionReport")
    .update({
      status,
      resolution: resolution ?? null,
      resolvedById: isFinal ? admin.id : null,
      resolvedAt: isFinal ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await audit(admin.id, "RESOLVE", "report", id, { status });
  return data as unknown as Report;
}

export async function deleteReport(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("QuestionReport")
    .select("id")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Report not found");
  await serverSupabase().from("QuestionReport").delete().eq("id", id);
  await audit(admin.id, "DELETE", "report", id);
}

// ── Category Requests ─────────────────────────────────────────────────

export type CategoryRequest = {
  id: string;
  name: string;
  description: string;
  examples: string | null;
  reason: string | null;
  requestorPhone: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { name: string } | null;
};

export type CategoryRequestListParams = {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
};

export async function listCategoryRequests(params: CategoryRequestListParams = {}): Promise<PaginatedResult<CategoryRequest>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase()
    .from("CategoryRequest")
    .select("*, Admin:reviewedById(name)", { count: "exact" });

  if (params.q) {
    query = query.or(`name.ilike.%${params.q}%,description.ilike.%${params.q}%,requestorPhone.ilike.%${params.q}%`);
  }
  if (params.status) query = query.eq("status", params.status);

  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const items = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    examples: r.examples,
    reason: r.reason,
    requestorPhone: r.requestorPhone,
    status: r.status,
    note: r.note,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    reviewedBy: r.Admin ?? null,
  })) as CategoryRequest[];

  return paginate(items, page, limit, count ?? 0);
}

export async function reviewCategoryRequest(
  id: string,
  status: "APPROVED" | "REJECTED",
  note?: string,
): Promise<CategoryRequest> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("CategoryRequest")
    .select("*")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Request not found");

  const { data, error } = await serverSupabase()
    .from("CategoryRequest")
    .update({
      status,
      note: note ?? null,
      reviewedById: admin.id,
      reviewedAt: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (status === "APPROVED") {
    const slug = slugify(existing.name);
    const { data: category, error: catErr } = await serverSupabase()
      .from("Category")
      .insert({
        name: existing.name,
        slug,
        description: existing.description,
        rules: existing.examples ?? null,
        createdById: admin.id,
      })
      .select("*")
      .single();
    if (!catErr && category) {
      await audit(admin.id, "APPROVE", "category-request", id, { categoryId: category.id });
    }
  } else {
    await audit(admin.id, "REJECT", "category-request", id);
  }

  return data as unknown as CategoryRequest;
}

export async function deleteCategoryRequest(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("CategoryRequest")
    .select("id")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Request not found");
  await serverSupabase().from("CategoryRequest").delete().eq("id", id);
  await audit(admin.id, "DELETE", "category-request", id);
}

// ── Contact Messages ──────────────────────────────────────────────────

export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: string;
};

export type ContactListParams = { page?: number; limit?: number; q?: string; status?: string };

export async function listContactMessages(params: ContactListParams = {}): Promise<PaginatedResult<ContactMessage>> {
  await requireAdmin();
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  let query = serverSupabase().from("ContactMessage").select("*", { count: "exact" });
  if (params.q) {
    query = query.or(`name.ilike.%${params.q}%,email.ilike.%${params.q}%,subject.ilike.%${params.q}%`);
  }
  if (params.status) query = query.eq("status", params.status);

  query = query.order("createdAt", { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return paginate((data ?? []) as ContactMessage[], page, limit, count ?? 0);
}

export async function updateContactMessageStatus(id: string, status: string): Promise<ContactMessage> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("ContactMessage")
    .select("id")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Message not found");
  const { data, error } = await serverSupabase()
    .from("ContactMessage")
    .update({ status: status ?? "read" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await audit(admin.id, "UPDATE", "contact", id);
  return data as ContactMessage;
}

export async function deleteContactMessage(id: string): Promise<void> {
  const admin = await requireAdmin();
  const { data: existing } = await serverSupabase()
    .from("ContactMessage")
    .select("id")
    .eq("id", id)
    .single();
  if (!existing) throw new Error("Message not found");
  await serverSupabase().from("ContactMessage").delete().eq("id", id);
  await audit(admin.id, "DELETE", "contact", id);
}
