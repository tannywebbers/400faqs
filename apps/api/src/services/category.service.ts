import { prisma } from "../lib/prisma";
import { cacheGet, cacheSet, cacheDel } from "../lib/redis";

const CACHE_KEY = "cache:public:categories";
const CACHE_TTL = 300;

// ============================================================
// Category queries
// ============================================================

export async function getActiveCategories() {
  const cached = await cacheGet<unknown[]>(CACHE_KEY);
  if (cached) return cached;
  const categories = await prisma.category.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ playCount: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      gameType: true,
      questionCount: true,
      playCount: true,
      icon: true,
      color: true,
      trending: true,
    },
  });
  await cacheSet(CACHE_KEY, categories, CACHE_TTL);
  return categories;
}

export async function getCategoryById(id: string) {
  return prisma.category.findFirst({ where: { id, status: "ACTIVE" } });
}

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findFirst({ where: { slug, status: "ACTIVE" } });
}

export async function getCategoryGameType(categoryId: string): Promise<string> {
  const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { gameType: true } });
  return cat?.gameType ?? "NORMAL";
}

// ============================================================
// Question count (active questions only, from DB count)
// ============================================================

export async function categoryActiveQuestionCount(categoryId: string): Promise<number> {
  return prisma.question.count({
    where: { categoryId, status: "APPROVED" },
  });
}

// ============================================================
// Max question number (for STANDARD categories)
// ============================================================

export async function categoryMaxNumber(categoryId: string): Promise<number> {
  const agg = await prisma.question.aggregate({
    where: { categoryId, status: "APPROVED", number: { not: null } },
    _max: { number: true },
  });
  return agg._max.number ?? 0;
}

// ============================================================
// Playable question numbers (gaps-aware)
// ============================================================

export async function getPlayableQuestionNumbers(categoryId: string): Promise<number[]> {
  const rows = await prisma.question.findMany({
    where: { categoryId, status: "APPROVED", number: { not: null } },
    select: { number: true },
    orderBy: { number: "asc" },
  });
  return rows.map((r: { number: number | null }) => r.number!).filter((n: number) => n !== null);
}

// ============================================================
// Cache invalidation
// ============================================================

export async function invalidateCategoryCache(): Promise<void> {
  await cacheDel(CACHE_KEY);
}
