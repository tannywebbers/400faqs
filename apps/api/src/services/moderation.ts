import { ContributionStatus, QuestionType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { checkDuplicates, moderateContent, type ModerationResult, type DuplicateResult } from "../lib/ai";
import { generateTicket } from "../lib/ticket";
import { notifyAdmins } from "./notifications";
import { getPublicSettings, settingBool, settingNumber } from "./settings";
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
  duplicate: DuplicateResult | null;
};

export async function submitContribution(input: SubmitContributionInput): Promise<SubmissionOutcome> {
  const settings = await getPublicSettings();
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

  const [moderation, duplicate] = await Promise.all([
    moderateContent(input.question),
    checkDuplicates(input.question, await prisma.question.findMany({ where: { status: "APPROVED" }, select: { id: true, text: true }, take: 200 })),
  ]);

  // Exact duplicate -> reject immediately
  if (duplicate.exact) {
    const ticket = generateTicket("CON");
    const contribution = await prisma.contribution.create({
      data: {
        ticket,
        userPhone: input.userPhone,
        userId: input.userId,
        categoryId: input.categoryId,
        question: input.question,
        type: input.type ?? "NORMAL",
        status: "REJECTED",
        aiResult: { moderation, duplicate },
        aiScore: duplicate.score,
        duplicateOfId: duplicate.matches[0]?.id,
        rejectionReason: "Duplicate of an existing question",
      },
    });
    return {
      ticket,
      status: ContributionStatus.REJECTED,
      message: `This question already exists. It was rejected as a duplicate. Ticket: ${ticket}`,
      moderation,
      duplicate,
    };
  }

  // Highly similar -> pending review
  if (duplicate.similar) {
    const ticket = generateTicket("CON");
    const contribution = await prisma.contribution.create({
      data: {
        ticket,
        userPhone: input.userPhone,
        userId: input.userId,
        categoryId: input.categoryId,
        question: input.question,
        type: input.type ?? "NORMAL",
        status: "PENDING",
        aiResult: { moderation, duplicate },
        aiScore: duplicate.score,
        duplicateOfId: duplicate.matches[0]?.id,
      },
    });
    await notifyAdmins({
      type: "CONTRIBUTION",
      title: "Contribution pending review",
      message: `Similar to an existing question (${Math.round(duplicate.score * 100)}%). Ticket ${ticket}`,
      link: `/admin/contributions?ticket=${ticket}`,
    });
    return {
      ticket,
      status: ContributionStatus.PENDING,
      message: `This question is very similar to an existing one. It has been sent for manual review. Ticket: ${ticket}`,
      moderation,
      duplicate,
    };
  }

  // Moderation failure
  if (!moderation.ok) {
    const ticket = generateTicket("CON");
    const contribution = await prisma.contribution.create({
      data: {
        ticket,
        userPhone: input.userPhone,
        userId: input.userId,
        categoryId: input.categoryId,
        question: input.question,
        type: input.type ?? "NORMAL",
        status: "FLAGGED",
        aiResult: { moderation, duplicate },
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
      duplicate,
    };
  }

  // Acceptable -> auto-approve or pending based on admin setting
  const autoApprove = settingBool(settings, "contribution.autoApprove", false);
  const ticket = generateTicket("CON");
  const contribution = await prisma.contribution.create({
    data: {
      ticket,
      userPhone: input.userPhone,
      userId: input.userId,
      categoryId: input.categoryId,
      question: input.question,
      type: input.type ?? "NORMAL",
      status: autoApprove ? "APPROVED" : "PENDING",
      aiResult: { moderation, duplicate },
      aiScore: duplicate.score,
    },
  });

  if (autoApprove) {
    const number = await nextFreeNumber(prisma, input.categoryId);
    await prisma.question.create({
      data: {
        text: input.question,
        type: input.type ?? "NORMAL",
        categoryId: input.categoryId,
        number,
        status: "APPROVED",
        source: "COMMUNITY",
        contributorId: input.userId ?? null,
        aiScore: duplicate.score,
      },
    });
    await prisma.category.update({ where: { id: input.categoryId }, data: { questionCount: { increment: 1 } } });
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
    duplicate,
  };
}
