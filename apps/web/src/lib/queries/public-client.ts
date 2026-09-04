/**
 * Client-side public data queries (for Next.js client components).
 * Uses the anon Supabase client — RLS enforced.
 */
import { browserSupabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────

export type PublicSettings = Record<string, string>;

export type CategoryListItem = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  gameType: string;
  questionCount: number;
  playCount: number;
  trending: boolean;
  createdByName: string;
};

export type CategoryListResult = CategoryListItem[] & {
  total?: number;
  totalPages?: number;
};

export type FaqRow = { id: string; question: string; answer: string };

export type HelpArticleListItem = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  updatedAt: string;
};

export type SearchResult = {
  categories: { id: string; name: string; slug: string; icon: string; questionCount: number }[];
  questions: { id: string; text: string; type: string; categoryName: string; categorySlug: string }[];
  articles: { id: string; title: string; slug: string; category: string }[];
};

// ── Settings ───────────────────────────────────────────────────────────

export async function fetchPublicSettings(): Promise<PublicSettings> {
  const { data, error } = await browserSupabase()
    .from("Setting")
    .select("key, value")
    .eq("public", true);
  if (error || !data) return {};
  const map: PublicSettings = {};
  for (const row of data) map[row.key] = row.value;
  return map;
}

// ── Categories ─────────────────────────────────────────────────────────

type CategoryQueryParams = {
  page?: number;
  limit?: number;
  q?: string;
  sort?: string;
};

export async function fetchPublicCategories(params: CategoryQueryParams = {}): Promise<CategoryListResult> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 12;
  const offset = (page - 1) * limit;

  let query = browserSupabase()
    .from("Category")
    .select("id, name, slug, description, icon, color, gameType, questionCount, playCount, trending, createdById, Admin!createdById(name)", { count: "exact" })
    .eq("status", "ACTIVE");

  if (params.q) {
    query = query.or(`name.ilike.%${params.q}%,description.ilike.%${params.q}%`);
  }

  switch (params.sort) {
    case "most_played":
      query = query.order("playCount", { ascending: false });
      break;
    case "most_questions":
      query = query.order("questionCount", { ascending: false });
      break;
    case "trending":
      query = query.order("trending", { ascending: false }).order("playCount", { ascending: false });
      break;
    case "alphabetical":
      query = query.order("name", { ascending: true });
      break;
    default:
      query = query.order("createdAt", { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error || !data) return [] as CategoryListResult;

  const items: CategoryListItem[] = data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    description: r.description as string,
    icon: r.icon as string,
    color: r.color as string,
    gameType: r.gameType as string,
    questionCount: r.questionCount as number,
    playCount: r.playCount as number,
    trending: r.trending as boolean,
    createdByName: ((r.Admin as { name?: string } | null)?.name) ?? "400faqs Team",
  }));

  return Object.assign(items, {
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

export async function fetchCategoryNames(): Promise<{ id: string; name: string; questionCount: number }[]> {
  const { data, error } = await browserSupabase()
    .from("Category")
    .select("id, name, questionCount")
    .eq("status", "ACTIVE")
    .order("name", { ascending: true })
    .limit(100);
  if (error || !data) return [];
  return data as { id: string; name: string; questionCount: number }[];
}

export async function fetchCategorySlugs(): Promise<{ slug: string; name: string }[]> {
  const { data, error } = await browserSupabase()
    .from("Category")
    .select("slug, name")
    .eq("status", "ACTIVE")
    .order("name", { ascending: true })
    .limit(100);
  if (error || !data) return [];
  return data as { slug: string; name: string }[];
}

// ── FAQs ──────────────────────────────────────────────────────────────

export async function fetchPublicFaqs(): Promise<FaqRow[]> {
  const { data, error } = await browserSupabase()
    .from("Faq")
    .select("id, question, answer")
    .eq("status", true)
    .order("order");
  if (error || !data) return [];
  return data as FaqRow[];
}

// ── Help Articles ──────────────────────────────────────────────────────

type HelpArticleParams = {
  page?: number;
  limit?: number;
  q?: string;
  category?: string;
};

export async function fetchHelpArticles(params: HelpArticleParams = {}): Promise<HelpArticleListItem[] & { total?: number; totalPages?: number }> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 12;
  const offset = (page - 1) * limit;

  let query = browserSupabase()
    .from("HelpArticle")
    .select("id, title, slug, excerpt, category, updatedAt", { count: "exact" })
    .eq("status", true);

  if (params.q) {
    query = query.or(`title.ilike.%${params.q}%,content.ilike.%${params.q}%`);
  }
  if (params.category && params.category !== "all") {
    query = query.eq("category", params.category);
  }

  query = query.order("order").range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error || !data) return Object.assign([], { total: 0, totalPages: 1 });

  return Object.assign(data as HelpArticleListItem[], {
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

export async function fetchHelpArticleCategories(): Promise<string[]> {
  const { data, error } = await browserSupabase()
    .from("HelpArticle")
    .select("category")
    .eq("status", true);
  if (error || !data) return [];
  return [...new Set(data.map((r: { category: string }) => r.category))];
}

// ── Search ─────────────────────────────────────────────────────────────

export async function searchAll(q: string): Promise<SearchResult> {
  if (!q || q.length < 2) return { categories: [], questions: [], articles: [] };

  const sb = browserSupabase();
  const [catRes, qRes, artRes] = await Promise.all([
    sb.from("Category")
      .select("id, name, slug, icon, questionCount")
      .eq("status", "ACTIVE")
      .ilike("name", `%${q}%`)
      .limit(6),
    sb.from("Question")
      .select("id, text, type, Category:categoryId(slug, name)")
      .eq("status", "APPROVED")
      .ilike("text", `%${q}%`)
      .limit(6),
    sb.from("HelpArticle")
      .select("id, title, slug, category")
      .eq("status", true)
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`)
      .limit(6),
  ]);

  return {
    categories: (catRes.data ?? []) as SearchResult["categories"],
    questions: (qRes.data ?? []).map((r: Record<string, unknown>) => {
      const cat = r.Category as { slug?: string; name?: string } | null;
      return {
        id: r.id as string,
        text: r.text as string,
        type: r.type as string,
        categoryName: cat?.name ?? "",
        categorySlug: cat?.slug ?? "",
      };
    }),
    articles: (artRes.data ?? []) as SearchResult["articles"],
  };
}

// ── Form Submissions ───────────────────────────────────────────────────

function generateTicket(prefix: string, length = 8): string {
  const chars = "0123456789ABCDEF";
  let body = "";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) body += chars[arr[i] % chars.length];
  return `${prefix}-${body}`;
}

export async function submitContact(values: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<{ message: string }> {
  const { error } = await browserSupabase()
    .from("ContactMessage")
    .insert({
      ...values,
      status: "new",
      updatedAt: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
  return { message: "Message received. We'll get back to you soon." };
}

export async function submitContribution(values: {
  userPhone?: string;
  categoryId: string;
  question: string;
  type: string;
}): Promise<{ ticket: string; status: string; message: string }> {
  const ticket = generateTicket("SUB");
  const { error } = await browserSupabase()
    .from("Contribution")
    .insert({
      ticket,
      userPhone: values.userPhone || null,
      categoryId: values.categoryId,
      question: values.question,
      type: values.type,
      status: "PENDING",
      updatedAt: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
  return { ticket, status: "PENDING", message: "Submission received for review." };
}

export async function submitReport(values: {
  reporterPhone: string;
  categorySlug: string;
  reason: string;
  notes?: string;
  questionText?: string;
}): Promise<{ ticket: string; status: string; message: string }> {
  const sb = browserSupabase();
  const { data: cat } = await sb
    .from("Category")
    .select("id")
    .eq("slug", values.categorySlug)
    .eq("status", "ACTIVE")
    .single();
  if (!cat) throw new Error("Category not found");

  let questionId: string | null = null;
  if (values.questionText) {
    const { data: q } = await sb
      .from("Question")
      .select("id")
      .eq("categoryId", cat.id)
      .ilike("text", `%${values.questionText}%`)
      .limit(1)
      .maybeSingle();
    questionId = q?.id ?? null;
  }

  const ticket = generateTicket("RPT");
  const { error } = await sb.from("QuestionReport").insert({
    ticket,
    categoryId: cat.id,
    questionId,
    reporterPhone: values.reporterPhone,
    reason: values.reason,
    notes: values.notes ?? values.questionText ?? null,
    status: "OPEN",
    updatedAt: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return { ticket, status: "OPEN", message: "Report submitted successfully." };
}

export async function submitCategoryRequest(values: {
  name: string;
  description: string;
  examples?: string;
  reason?: string;
  requestorPhone: string;
}): Promise<{ id: string; status: string; message: string }> {
  const { data, error } = await browserSupabase()
    .from("CategoryRequest")
    .insert({
      name: values.name,
      description: values.description,
      examples: values.examples ?? null,
      reason: values.reason ?? null,
      requestorPhone: values.requestorPhone,
      status: "PENDING",
      updatedAt: new Date().toISOString(),
    })
    .select("id, status")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, status: data.status, message: "Category request received." };
}
