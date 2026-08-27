import { Prisma, SessionState, SessionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { cancelGatesForSession } from "./monetization";

// ============================================================
// Types
// ============================================================

export type SessionWithUsers = Prisma.SessionGetPayload<{
  include: { creator: true; joiner: true; category: true; currentQuestion: true };
}>;

// ============================================================
// Session lookup
// ============================================================

export async function getActiveSessionForUser(userId: string): Promise<SessionWithUsers | null> {
  return prisma.session.findFirst({
    where: {
      status: { in: ["WAITING", "ACTIVE"] },
      OR: [{ creatorId: userId }, { joinerId: userId }],
    },
    include: { creator: true, joiner: true, category: true, currentQuestion: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSessionById(sessionId: string): Promise<SessionWithUsers | null> {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: { creator: true, joiner: true, category: true, currentQuestion: true },
  });
}

export async function getSessionByInviteCode(code: string): Promise<SessionWithUsers | null> {
  return prisma.session.findUnique({
    where: { inviteCode: code },
    include: { creator: true, joiner: true, category: true, currentQuestion: true },
  });
}

// ============================================================
// Participant helpers
// ============================================================

export function isParticipant(
  session: { creatorId: string; joinerId: string | null },
  userId: string
): boolean {
  return session.creatorId === userId || session.joinerId === userId;
}

export function otherUser(session: SessionWithUsers, userId: string) {
  return session.creatorId === userId ? session.joiner : session.creator;
}

export function otherUserId(
  session: { creatorId: string; joinerId: string | null },
  userId: string
): string | null {
  return session.creatorId === userId ? session.joinerId : session.creatorId;
}

// ============================================================
// Active session constraint: prevent multiple active sessions
// ============================================================

export async function hasActiveSession(userId: string): Promise<boolean> {
  const count = await prisma.session.count({
    where: {
      status: { in: ["WAITING", "ACTIVE"] },
      OR: [{ creatorId: userId }, { joinerId: userId }],
    },
  });
  return count > 0;
}

// ============================================================
// Atomic join (transactional)
// ============================================================

export async function atomicJoin(
  sessionId: string,
  joinerId: string,
  creatorId: string
): Promise<{ success: boolean; alreadyTaken: boolean }> {
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.session.updateMany({
      where: {
        id: sessionId,
        status: "WAITING",
        joinerId: null,
        state: "WAITING_FOR_OPPONENT",
      },
      data: {
        joinerId,
        status: "ACTIVE",
        state: "CATEGORY_SELECTION",
        categoryProposerId: creatorId,
        startedAt: new Date(),
        expiresAt: null,
        lastActivityAt: new Date(),
      },
    });
    if (res.count === 1) {
      await tx.user.updateMany({
        where: { id: { in: [creatorId, joinerId] } },
        data: { totalSessions: { increment: 1 } },
      });
    }
    return res.count;
  });
  return { success: result === 1, alreadyTaken: result === 0 };
}

// ============================================================
// Atomic category proposal
// ============================================================

export async function atomicProposeCategory(
  sessionId: string,
  proposerId: string,
  categoryId: string,
  proposalHistory: unknown[]
): Promise<boolean> {
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.session.updateMany({
      where: { id: sessionId, state: "CATEGORY_SELECTION", categoryProposerId: proposerId },
      data: {
        pendingCategoryId: categoryId,
        categoryProposerId: proposerId,
        state: "WAITING_FOR_CATEGORY_RESPONSE",
        lastActivityAt: new Date(),
      },
    });
    if (res.count === 1) {
      await tx.session.update({
        where: { id: sessionId },
        data: {
          proposalHistory: [...proposalHistory, { categoryId, proposedBy: proposerId, at: new Date().toISOString() }] as Prisma.InputJsonValue,
        },
      });
    }
    return res.count;
  });
  return result === 1;
}

// ============================================================
// Atomic category accept
// ============================================================

export async function atomicAcceptCategory(
  sessionId: string,
  accepterId: string,
  pendingCategoryId: string,
  targetState: SessionState,
  creatorId: string
): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,
      state: "WAITING_FOR_CATEGORY_RESPONSE",
      categoryProposerId: { not: accepterId },
    },
    data: {
      categoryId: pendingCategoryId,
      pendingCategoryId: null,
      categoryProposerId: null,
      round: 1,
      currentTurnUserId: creatorId,
      state: targetState,
      lastActivityAt: new Date(),
    },
  });
  return result.count === 1;
}

// ============================================================
// Atomic start suggestion
// ============================================================

export async function atomicStartSuggestion(
  sessionId: string,
  suggesterId: string,
  creatorId: string
): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,
      state: "WAITING_FOR_CATEGORY_RESPONSE",
      categoryProposerId: { not: suggesterId },
    },
    data: {
      pendingCategoryId: null,
      categoryProposerId: suggesterId,
      state: "CATEGORY_SELECTION",
      lastActivityAt: new Date(),
    },
  });
  return result.count === 1;
}

// ============================================================
// Atomic decline category
// ============================================================

export async function atomicDeclineCategory(
  sessionId: string,
  declinerId: string,
  creatorId: string
): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,
      state: "WAITING_FOR_CATEGORY_RESPONSE",
      categoryProposerId: { not: declinerId },
    },
    data: {
      pendingCategoryId: null,
      categoryProposerId: creatorId,
      state: "CATEGORY_SELECTION",
      lastActivityAt: new Date(),
    },
  });
  return result.count === 1;
}

// ============================================================
// Atomic number selection
// ============================================================

export async function atomicSelectNumber(
  sessionId: string,
  userId: string,
  questionId: string,
  number: number,
  round: number,
  answererId: string,
  questionType: string
): Promise<{ success: boolean; duplicate: boolean }> {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const res = await tx.session.updateMany({
        where: { id: sessionId, state: "NUMBER_SELECTION", currentTurnUserId: userId },
        data: {
          currentQuestionId: questionId,
          currentNumber: number,
          state: "WAITING_FOR_ANSWER",
          lastActivityAt: new Date(),
        },
      });
      if (res.count === 0) return { success: false, duplicate: false };
      await tx.gameMove.create({
        data: {
          sessionId,
          questionId,
          round,
          number,
          askedBy: userId,
          answeredBy: answererId,
          type: questionType as "NORMAL" | "TRUTH" | "DARE",
          status: "PENDING_ANSWER",
        },
      });
      await tx.question.update({
        where: { id: questionId },
        data: { playsCount: { increment: 1 } },
      });
      return { success: true, duplicate: false };
    });
    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, duplicate: true };
    }
    throw err;
  }
}

// ============================================================
// Atomic Truth/Dare selection
// ============================================================

export async function atomicSelectTruthDare(
  sessionId: string,
  userId: string,
  questionId: string,
  round: number,
  answererId: string,
  questionType: string
): Promise<{ success: boolean; duplicate: boolean }> {
  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const res = await tx.session.updateMany({
        where: { id: sessionId, state: "TRUTH_DARE_SELECTION", currentTurnUserId: userId },
        data: {
          currentQuestionId: questionId,
          state: "WAITING_FOR_ANSWER",
          lastActivityAt: new Date(),
        },
      });
      if (res.count === 0) return { success: false, duplicate: false };
      await tx.gameMove.create({
        data: {
          sessionId,
          questionId,
          round,
          askedBy: userId,
          answeredBy: answererId,
          type: questionType as "TRUTH" | "DARE",
          status: "PENDING_ANSWER",
        },
      });
      await tx.question.update({
        where: { id: questionId },
        data: { playsCount: { increment: 1 } },
      });
      return { success: true, duplicate: false };
    });
    return result;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, duplicate: true };
    }
    throw err;
  }
}

// ============================================================
// Atomic answer + turn swap
// ============================================================

export async function atomicAnswerAndSwap(
  sessionId: string,
  answererId: string,
  round: number,
  answer: string,
  nextState: SessionState,
  nextAskerId: string
): Promise<{ success: boolean; advanceRound: boolean }> {
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Record the answer
    const moveRes = await tx.gameMove.updateMany({
      where: { sessionId, round, status: "PENDING_ANSWER", answeredBy: answererId },
      data: { answer, status: "ANSWERED", answeredAt: new Date() },
    });
    if (moveRes.count !== 1) return { success: false, advanceRound: false };

    // Increment turnsPlayed and advance round + swap turn
    await tx.session.updateMany({
      where: { id: sessionId, state: "WAITING_FOR_ANSWER" },
      data: {
        turnsPlayed: { increment: 1 },
        state: nextState,
        round: { increment: 1 },
        currentTurnUserId: nextAskerId,
        lastActivityAt: new Date(),
      },
    });

    return { success: true, advanceRound: true };
  });
  return result;
}

// ============================================================
// Finish game (atomic)
// ============================================================

export async function atomicFinishGame(
  sessionId: string,
  winnerId: string,
  categoryId: string | null
): Promise<boolean> {
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const res = await tx.session.updateMany({
      where: { id: sessionId, status: "ACTIVE" },
      data: { status: "COMPLETED", state: "COMPLETED", finishedAt: new Date(), winnerId },
    });
    if (res.count === 1 && categoryId) {
      await tx.category.updateMany({
        where: { id: categoryId },
        data: { playCount: { increment: 1 } },
      });
    }
    return res.count;
  });
  return result === 1;
}

// ============================================================
// End session (atomic)
// ============================================================

export async function atomicEndSession(
  sessionId: string,
  state: SessionState,
  leaverId?: string | null
): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, status: { in: ["WAITING", "ACTIVE"] } },
    data: {
      status: "ABANDONED",
      state,
      finishedAt: new Date(),
      leaverId,
    },
  });
  return result.count === 1;
}

// ============================================================
// Expire session (from worker)
// ============================================================

export async function expireSession(sessionId: string): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, status: "WAITING" },
    data: { status: "ABANDONED", state: "EXPIRED", finishedAt: new Date() },
  });
  if (result.count === 1) await cancelGatesForSession(sessionId);
  return result.count === 1;
}

// ============================================================
// Timeout session (from worker)
// ============================================================

export async function timeoutSession(sessionId: string): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, status: "ACTIVE" },
    data: { status: "ABANDONED", state: "ENDED", finishedAt: new Date() },
  });
  if (result.count === 1) await cancelGatesForSession(sessionId);
  return result.count === 1;
}

// ============================================================
// Cancel category proposal
// ============================================================

export async function atomicCancelCategoryProposal(
  sessionId: string,
  state: SessionState,
  creatorId: string
): Promise<boolean> {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, state },
    data: { pendingCategoryId: null, categoryProposerId: creatorId, state: "CATEGORY_SELECTION" },
  });
  return result.count === 1;
}

// ============================================================
// Update last activity
// ============================================================

export async function touchSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { lastActivityAt: new Date() },
  });
}
