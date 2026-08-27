import { ContributionStatus, QuestionType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { moderateContent, type ModerationResult } from "../lib/ai";
import { checkQuestionSimilarity, isExactDuplicateAtApproval, type QuestionSimilarityResult } from "./question-similarity";
import { generateTicket } from "../lib/ticket";
import { notifyAdmins } from "./notifications";
import { getAllSettings, settingsToRecord, settingBool, settingNumber } from "./settings";
import { nextFreeNumber } from "../lib/questionNumber";
import { logger } from "../lib/logger";

export type SubmitContributionInput = {
  userPhone: string;
  userId?: string;
  categoryId: string;
  question: string;
  type?: QuestionType;
};

export type SubmissionOutcome = {
  ticket: string;
  status: ContributionStatus;
  message: string;
  moderation: ModerationResult;
  duplicate: (QuestionSimilarityResult & { exact: boolean; similar: boolean }) | null;
};

const ALLOWED_TYPES: Record<string, QuestionType[]> = {
  TRUTH_DARE: ["TRUTH", "DARE"],
  NORMAL: ["NORMAL"],
};

function defaultTypeFor(categoryGameType: string): QuestionType {
  return categoryGameType === "TRUTH_DARE" ? "TRUTH" : "NORMAL";
}

export async function submitContribution(input: SubmitContributionInput): Promise<SubmissionOutcome> {
  const rows = await getAllSettings();
  const settings = settingsToRecord(rows);
  const perDay = settingNumber(settings, "contribution.perDayLimit", 50);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.contribution.count({
    where: { userPhone: input.userPhone, createdAt: { gte: dayStart } },
  });
  if (todayCount >= perDay) {
    return {
      ticket: "",
      status: ContributionStatus.REJECTED,
      message: `You have reached today's limit of ${perDay} contributions.`,
      moderation: { ok: false, flagged: true, spam: false, profanity: false, gibberish: false, score: 0, reason: "Daily limit reached" },
      duplicate: null,
    };
  }

  const category = await prisma.category.findFirst({ where: { id: input.categoryId, status: "ACTIVE" } });
  if (!category) {
    return {
      ticket: "",
      status: ContributionStatus.REJECTED,
      message: "Category not found or inactive.",
      moderation: { ok: false, flagged: true, spam: false, profanity: false, gibberish: false, score: 0, reason: "Invalid category" },
      duplicate: null,
    };
  }

  // Respect the category's question type rules (Truth & Dare vs normal questions)
  const allowed = ALLOWED_TYPES[category.gameType] ?? ["NORMAL"];
  const type = input.type ?? defaultTypeFor(category.gameType);
  if (!allowed.includes(type)) {
    return {
      ticket: "",
      status: ContributionStatus.REJECTED,
      message: category.gameType === "TRUTH_DARE" ? "This category only accepts Truth or Dare questions." : "This category only accepts standard questions.",
      moderation: { ok: false, flagged: true, spam: false, profanity: false, gibberish: false, score: 0, reason: "Incompatible question type" },
      duplicate: null,
    };
  }

  const [moderation, duplicate] = await Promise.all([
    moderateContent(input.question),
    checkQuestionSimilarity(input.question, input.categoryId, type),
  ]);

  const similarResult = {
    ...duplicate,
    exact: duplicate.classification === "EXACT_DUPLICATE",
    similar: duplicate.classification !== "UNIQUE",
  };

  // Exact duplicate -> reject immediately
  if (duplicate.classification === "EXACT_DUPLICATE") {
    const ticket = generateTicket("CON");
    const contribution = await prisma.contribution.create({
      data: {
        ticket,
        userPhone: input.userPhone,
        userId: input.userId,
        categoryId: input.categoryId,
        question: input.question,
        type,
        status: "REJECTED",
        aiResult: { moderation, duplicate: similarResult },
        aiScore: duplicate.score,
        duplicateOfId: duplicate.matches[0]?.questionId ?? null,
        rejectionReason: "Duplicate of an existing question",
      },
    });
    return {
      ticket,
      status: ContributionStatus.REJECTED,
      message: `This question already exists. It was rejected as a duplicate. Ticket: ${ticket}`,
      moderation,
      duplicate: similarResult,
    };
  }

  // Very similar (or low-confidence) -> pending manual review
  if (duplicate.reviewRequired || duplicate.classification === "VERY_SIMILAR") {
    const isVerySimilar = duplicate.classification === "VERY_SIMILAR" && !duplicate.reviewRequired;
    const ticket = generateTicket("CON");
    const contribution = await prisma.contribution.create({
      data: {
        ticket,
        userPhone: input.userPhone,
        userId: input.userId,
        categoryId: input.categoryId,
        question: input.question,
        type,
        status: "PENDING",
        aiResult: { moderation, duplicate: similarResult },
        aiScore: duplicate.score,
        duplicateOfId: duplicate.matches[0]?.questionId ?? null,
        ...(duplicate.reviewReason ? { rejectionReason: duplicate.reviewReason } : {}),
      },
    });
    await notifyAdmins({
      type: "CONTRIBUTION",
      title: isVerySimilar ? "Contribution pending review (similar)" : "Contribution pending review",
      message: isVerySimilar
        ? `Very similar to an existing question (${Math.round(duplicate.score * 100)}%). Ticket ${ticket}`
        : `${duplicate.reviewReason ?? "AI similarity check unavailable"}. Ticket ${ticket}`,
      link: `/admin/contributions?ticket=${ticket}`,
    });
    return {
      ticket,
      status: ContributionStatus.PENDING,
      message: duplicate.reviewRequired
        ? `We could not complete the AI duplicate check just now, so your question will be reviewed manually. Ticket: ${ticket}`
        : `This question is very similar to an existing one. It has been sent for manual review. Ticket: ${ticket}`,
      moderation,
      duplicate: similarResult,
    };
  }

  // Content moderation failure -> flagged for manual review
  if (!moderation.ok) {
    const ticket = generateTicket("CON");
    const contribution = await prisma.contribution.create({
      data: {
        ticket,
        userPhone: input.userPhone,
        userId: input.userId,
        categoryId: input.categoryId,
        question: input.question,
        type,
        status: "FLAGGED",
        aiResult: { moderation, duplicate: similarResult },
        aiScore: moderation.score,
        rejectionReason: moderation.reason,
      },
    });
    await notifyAdmins({
      type: "CONTRIBUTION",
      title: "Contribution flagged",
      message: `Flagged: ${moderation.reason}. Ticket ${ticket}`,
      link: `/admin/contributions?ticket=${ticket}`,
    });
    return {
      ticket,
      status: ContributionStatus.FLAGGED,
      message: `Your submission was flagged (${moderation.reason}). It needs manual review. Ticket: ${ticket}`,
      moderation,
      duplicate: similarResult,
    };
  }

  // Acceptable + UNIQUE -> auto-approve or pending based on admin setting.
  // Auto-approval only happens when AI duplicate detection is available.
  const autoApprove = settingBool(settings, "contribution.autoApprove", false);
  const ticket = generateTicket("CON");
  const contribution = await prisma.contribution.create({
    data: {
      ticket,
      userPhone: input.userPhone,
      userId: input.userId,
      categoryId: input.categoryId,
      question: input.question,
      type,
      status: autoApprove ? "APPROVED" : "PENDING",
      aiResult: { moderation, duplicate: similarResult },
      aiScore: duplicate.score,
    },
  });

  if (autoApprove) {
    await createApprovedQuestion({ text: input.question, type, categoryId: input.categoryId, userId: input.userId ?? null, aiScore: duplicate.score });
    logger.info("[moderation] contribution auto-approved", { ticket });
  } else {
    await notifyAdmins({
      type: "CONTRIBUTION",
      title: "New contribution",
      message: `"${input.question.slice(0, 80)}" - Ticket ${ticket}`,
      link: `/admin/contributions?ticket=${ticket}`,
    });
  }

  return {
    ticket,
    status: autoApprove ? ContributionStatus.APPROVED : ContributionStatus.PENDING,
    message: autoApprove
      ? `Your question was approved and added! Ticket: ${ticket}`
      : `Your question passed all checks and is pending approval. Ticket: ${ticket}`,
    moderation,
    duplicate: similarResult,
  };
}

export async function createApprovedQuestion(input: {
  text: string;
  type: QuestionType;
  categoryId: string;
  userId: string | null;
  aiScore: number | null;
}): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await nextFreeNumber(prisma, input.categoryId);
    try {
      await prisma.question.create({
        data: {
          text: input.text,
          type: input.type,
          categoryId: input.categoryId,
          number,
          status: "APPROVED",
          source: "COMMUNITY",
          contributorId: input.userId,
          aiScore: input.aiScore,
        },
      });
      await prisma.category.update({ where: { id: input.categoryId }, data: { questionCount: { increment: 1 } } });
      return;
    } catch (err) {
      const e = err as { code?: string };
      if (e?.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not assign a unique question number");
}

/**
 * Guard used by the admin review flow: never turn a contribution into an
 * approved question when an exact duplicate already exists (catches races).
 */
export async function recheckDuplicateBeforeApproval(contribution: {
  question: string;
  categoryId: string;
  type: QuestionType;
}): Promise<boolean> {
  return isExactDuplicateAtApproval(contribution.question, contribution.categoryId, contribution.type);
}