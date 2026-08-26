import { prisma } from "./prisma";

type NumberQuery = { question: { findMany: typeof prisma.question.findMany } };

/** Smallest positive integer not yet used by a question in the category. */
export async function nextFreeNumber(db: NumberQuery, categoryId: string): Promise<number> {
  const used = await db.question.findMany({ where: { categoryId }, select: { number: true } });
  const set = new Set(used.map((r) => r.number).filter((n): n is number => n !== null));
  let n = 1;
  while (set.has(n)) n++;
  return n;
}
