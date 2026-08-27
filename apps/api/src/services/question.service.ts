import { QuestionType } from "@prisma/client";
import { prisma } from "../lib/prisma";

// ============================================================
// Question lookup
// ============================================================

export async function getQuestionByCategoryAndNumber(
  categoryId: string,
  number: number
): Promise<{ id: string; text: string; type: QuestionType } | null> {
  return prisma.question.findFirst({
    where: { categoryId, number, status: "APPROVED" },
    select: { id: true, text: true, type: true },
  });
}

export async function isQuestionPlayable(questionId: string): Promise<boolean> {
  const q = await prisma.question.findUnique({ where: { id: questionId }, select: { status: true } });
  return q?.status === "APPROVED";
}

// ============================================================
// Active question count
// ============================================================

export async function activeQuestionCount(categoryId: string): Promise<number> {
  return prisma.question.count({ where: { categoryId, status: "APPROVED" } });
}

// ============================================================
// Available question numbers (active, gap-aware)
// ============================================================

export async function getAvailableQuestionNumbers(categoryId: string): Promise<number[]> {
  const rows = await prisma.question.findMany({
    where: { categoryId, status: "APPROVED", number: { not: null } },
    select: { number: true },
    orderBy: { number: "asc" },
  });
  return rows.map((r: { number: number | null }) => r.number!).filter(Boolean);
}

// ============================================================
// Used questions in a session
// ============================================================

export async function getUsedQuestionIds(sessionId: string): Promise<string[]> {
  const moves = await prisma.gameMove.findMany({
    where: { sessionId },
    select: { questionId: true },
  });
  return moves.map((m: { questionId: string }) => m.questionId);
}

export async function getUsedQuestionNumbers(sessionId: string): Promise<Set<number>> {
  const moves = await prisma.gameMove.findMany({
    where: { sessionId, number: { not: null } },
    select: { number: true },
  });
  const nums: (number | null)[] = moves.map((m: { number: number | null }) => m.number);
  return new Set(nums.filter((n): n is number => n !== null));
}

// ============================================================
// Is question number already used in session
// ============================================================

export async function isNumberUsedInSession(sessionId: string, number: number): Promise<boolean> {
  const count = await prisma.gameMove.count({
    where: { sessionId, number },
  });
  return count > 0;
}

// ============================================================
// Is question already used in session (by question ID)
// ============================================================

export async function isQuestionUsedInSession(sessionId: string, questionId: string): Promise<boolean> {
  const count = await prisma.gameMove.count({
    where: { sessionId, questionId },
  });
  return count > 0;
}

// ============================================================
// Random unused question of a type (Truth / Dare)
// ============================================================

export async function getRandomUnusedQuestionOfType(
  categoryId: string,
  type: QuestionType,
  sessionId: string
): Promise<{ id: string; text: string } | null> {
  const usedIds = await getUsedQuestionIds(sessionId);
  const remaining = await prisma.question.findMany({
    where: {
      categoryId,
      status: "APPROVED",
      type,
      ...(usedIds.length ? { id: { notIn: usedIds } } : {}),
    },
    select: { id: true, text: true },
    take: 100,
    orderBy: { playsCount: "asc" },
  });
  if (remaining.length === 0) return null;
  return remaining[Math.floor(Math.random() * remaining.length)];
}

// ============================================================
// Remaining question count for a session
// ============================================================

export async function remainingQuestionCount(session: {
  id: string;
  categoryId: string | null;
  category?: { gameType: string } | null;
}): Promise<number> {
  if (!session.categoryId) return 0;

  const usedIds = await getUsedQuestionIds(session.id);

  if (session.category?.gameType === "TRUTH_DARE") {
    return prisma.question.count({
      where: {
        categoryId: session.categoryId,
        status: "APPROVED",
        ...(usedIds.length ? { id: { notIn: usedIds } } : {}),
      },
    });
  }

  // STANDARD: count based on available numbers minus used numbers
  const maxNumber = await prisma.question.aggregate({
    where: { categoryId: session.categoryId, status: "APPROVED", number: { not: null } },
    _max: { number: true },
  });
  const max = maxNumber._max.number ?? 0;
  const usedNumbers = await getUsedQuestionNumbers(session.id);
  return Math.max(0, max - usedNumbers.size);
}

// ============================================================
// Validate question type compatibility
// ============================================================

export function isCompatibleQuestionType(
  questionType: QuestionType,
  categoryGameType: string
): boolean {
  if (categoryGameType === "TRUTH_DARE") {
    return questionType === "TRUTH" || questionType === "DARE";
  }
  // NORMAL/STANDARD category
  return questionType === "NORMAL";
}

// ============================================================
// Increment play count
// ============================================================

export async function incrementQuestionPlayCount(questionId: string): Promise<void> {
  await prisma.question.update({
    where: { id: questionId },
    data: { playsCount: { increment: 1 } },
  });
}
