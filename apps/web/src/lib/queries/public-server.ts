/**
 * Server-side public data queries (for Next.js server components / RSC).
 * Uses the service_role Supabase client — never import from "use client" files.
 */
import { serverSupabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────

export type PublicSettings = Record<string, string>;

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
};

export type PublicStats = {
  categories: number;
  questions: number;
  sessions: number;
  moves: number;
  contributions: number;
  players: number;
  approvedQuestions: number;
};

export type CategoryDetail = {
  id: string;
  name: string;
  slug: string;
  description: string;
  rules: string | null;
  icon: string;
  color: string;
  gameType: string;
  questionCount: number;
  playCount: number;
  trending: boolean;
  contributorCount: number;
  reportCount: number;
  createdByName: string;
  recentlyAdded: { id: string; text: string; type: string; createdAt: string }[];
};

export type HelpArticleDetail = {
  id: string;
  title: string;
  content: string;
  category: string;
  updatedAt: string;
};

export type FaqRow = { id: string; question: string; answer: string };

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  questionCount: number;
  playCount: number;
  trending: boolean;
  createdByName: string;
};

// ── Queries ────────────────────────────────────────────────────────────

export async function getPublicSettings(): Promise<PublicSettings> {
  const { data, error } = await serverSupabase()
    .from("Setting")
    .select("key, value")
    .eq("public", true);
  if (error) return {};
  const map: PublicSettings = {};
  for (const row of data ?? []) map[row.key] = row.value;
  return map;
}

export async function getPublicLanding(): Promise<LandingSection[]> {
  const { data, error } = await serverSupabase()
    .from("landing_content")
    .select("*")
    .order("sort_order");
  if (error || !data) return [];
  // Map snake_case DB columns to camelCase
  return data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    sectionKey: r.section_key as string,
    title: r.title as string | null,
    subtitle: r.subtitle as string | null,
    content: r.content as string | null,
    imageUrl: r.image_url as string | null,
    buttonText: r.button_text as string | null,
    buttonUrl: r.button_url as string | null,
    isVisible: r.is_visible as boolean,
    sortOrder: r.sort_order as number,
  }));
}

export async function getPublicStats(): Promise<PublicStats> {
  const sb = serverSupabase();
  const [catRes, qRes, sessRes, moveRes, contribRes, userRes] = await Promise.all([
    sb.from("Category").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    sb.from("Question").select("id", { count: "exact", head: true }).eq("status", "APPROVED"),
    sb.from("Session").select("id", { count: "exact", head: true }),
    sb.from("GameMove").select("id", { count: "exact", head: true }),
    sb.from("Contribution").select("id", { count: "exact", head: true }).eq("status", "APPROVED"),
    sb.from("User").select("id", { count: "exact", head: true }),
  ]);
  const approvedQuestions = qRes.count ?? 0;
  return {
    categories: catRes.count ?? 0,
    questions: approvedQuestions,
    sessions: sessRes.count ?? 0,
    moves: moveRes.count ?? 0,
    contributions: contribRes.count ?? 0,
    players: userRes.count ?? 0,
    approvedQuestions,
  };
}

export async function getTrendingCategories(limit = 6): Promise<CategorySummary[]> {
  const { data, error } = await serverSupabase()
    .from("Category")
    .select("id, name, slug, description, icon, color, questionCount, playCount, trending, createdById, Admin!createdById(name)")
    .eq("status", "ACTIVE")
    .order("playCount", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    description: r.description as string,
    icon: r.icon as string,
    color: r.color as string,
    questionCount: r.questionCount as number,
    playCount: r.playCount as number,
    trending: r.trending as boolean,
    createdByName: ((r.Admin as { name?: string } | null)?.name) ?? "400faqs Team",
  }));
}

export async function getPublicFaqs(): Promise<FaqRow[]> {
  const { data, error } = await serverSupabase()
    .from("Faq")
    .select("id, question, answer")
    .eq("status", true)
    .order("order");
  if (error || !data) return [];
  return data as FaqRow[];
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDetail | null> {
  const sb = serverSupabase();
  const { data: cat, error } = await sb
    .from("Category")
    .select("*, Admin!createdById(name)")
    .eq("slug", slug)
    .eq("status", "ACTIVE")
    .single();
  if (error || !cat) return null;

  const categoryId = cat.id as string;

  const [recentQ, contribRes, reportRes] = await Promise.all([
    sb.from("Question")
      .select("id, text, type, createdAt")
      .eq("categoryId", categoryId)
      .eq("status", "APPROVED")
      .order("createdAt", { ascending: false })
      .limit(5),
    sb.from("Contribution")
      .select("userId", { count: "exact", head: true })
      .eq("categoryId", categoryId)
      .eq("status", "APPROVED")
      .not("userId", "is", null),
    sb.from("QuestionReport")
      .select("id", { count: "exact", head: true })
      .eq("categoryId", categoryId),
  ]);

  return {
    id: cat.id as string,
    name: cat.name as string,
    slug: cat.slug as string,
    description: cat.description as string,
    rules: cat.rules as string | null,
    icon: cat.icon as string,
    color: cat.color as string,
    gameType: cat.gameType as string,
    questionCount: cat.questionCount as number,
    playCount: cat.playCount as number,
    trending: cat.trending as boolean,
    contributorCount: contribRes.count ?? 0,
    reportCount: reportRes.count ?? 0,
    createdByName: ((cat.Admin as { name?: string } | null)?.name) ?? "400faqs Team",
    recentlyAdded: (recentQ.data ?? []).map((q: Record<string, unknown>) => ({
      id: q.id as string,
      text: q.text as string,
      type: q.type as string,
      createdAt: q.createdAt as string,
    })),
  };
}

export async function getHelpArticleBySlug(slug: string): Promise<HelpArticleDetail | null> {
  const { data, error } = await serverSupabase()
    .from("HelpArticle")
    .select("id, title, content, category, updatedAt")
    .eq("slug", slug)
    .eq("status", true)
    .single();
  if (error || !data) return null;
  return data as HelpArticleDetail;
}

export async function getLegalContent(
  sectionKey: string
): Promise<{ title: string | null; content: string | null } | null> {
  const { data, error } = await serverSupabase()
    .from("landing_content")
    .select("title, content")
    .eq("section_key", sectionKey)
    .single();
  if (error || !data) return null;
  return { title: data.title as string | null, content: data.content as string | null };
}
