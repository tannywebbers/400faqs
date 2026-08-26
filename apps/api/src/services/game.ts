import { Prisma, QuestionType, SessionState, SessionStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { getRedis } from "../lib/redis";
import { sendText, sendButtons, sendList } from "../lib/whatsapp";
import { generateInviteCode } from "../lib/ticket";
import { getPublicSettings, settingNumber } from "./settings";
import { submitContribution } from "./moderation";
import { parseCommand, normalizeInput } from "./commands";
import { messages, waClickLink } from "./messages";
import { logger } from "../lib/logger";

// void-returning send wrappers so handlers can `return reply(...)`.
async function reply(phone: string, text: string): Promise<void> {
  await sendText(phone, text);
}

async function replyButtons(phone: string, body: string, buttons: { id: string; title: string }[]): Promise<void> {
  await sendButtons(phone, body, buttons);
}

async function replyList(
  phone: string,
  body: string,
  buttonText: string,
  rows: { id: string; title: string; description?: string }[]
): Promise<void> {
  await sendList(phone, body, buttonText, rows);
}

// ============================================================
// Flow state (contribution/report only) in Redis.
// Authoritative GAME state lives on the Session row in the DB.
// ============================================================

type FlowStep = {
  step: "contribute_text" | "contribute_category" | "report_text" | "report_reason";
  pendingQuestion?: string;
  pendingReportQuestion?: string;
};

const FLOW_TTL = 6 * 60 * 60;
const flowKey = (phone: string) => `wa:flow:${phone}`;

async function getFlow(phone: string): Promise<FlowStep | null> {
  const raw = await getRedis().get(flowKey(phone));
  return raw ? (JSON.parse(raw) as FlowStep) : null;
}

async function setFlow(phone: string, step: FlowStep) {
  await getRedis().set(flowKey(phone), JSON.stringify(step), "EX", FLOW_TTL);
}

async function clearFlow(phone: string) {
  await getRedis().del(flowKey(phone));
}

// ============================================================
// User helpers
// ============================================================

export async function getOrCreateUser(phone: string, name?: string) {
  const phoneDigits = phone.replace(/\D/g, "");
  const waId = `wa_${phoneDigits}`;
  const cleanName = name ? normalizeInput(name).slice(0, 100) : undefined;
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    const data: { name?: string; lastSeenAt: Date } = { lastSeenAt: new Date() };
    if (cleanName && cleanName !== existing.name) data.name = cleanName;
    const updated = await prisma.user.update({ where: { id: existing.id }, data });
    return { user: updated, created: false };
  }
  const user = await prisma.user.create({
    data: { phone, waId, name: cleanName ?? null, lastSeenAt: new Date() },
  });
  logger.info("[whatsapp] user created", { phone });
  return { user, created: true };
}

function cleanText(raw: string): string {
  return normalizeInput(raw);
}

// ============================================================
// Settings
// ============================================================

async function getSettingValue(key: string, fallback: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const v = await getSettingValue(key, String(fallback));
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ============================================================
// Session lookup
// ============================================================

type SessionWithUsers = Prisma.SessionGetPayload<{
  include: { creator: true; joiner: true; category: true; currentQuestion: true };
}>;

async function getActiveSessionForUser(userId: string): Promise<SessionWithUsers | null> {
  return prisma.session.findFirst({
    where: {
      status: { in: ["WAITING", "ACTIVE"] },
      OR: [{ creatorId: userId }, { joinerId: userId }],
    },
    include: { creator: true, joiner: true, category: true, currentQuestion: true },
    orderBy: { createdAt: "desc" },
  });
}

function isParticipant(session: { creatorId: string; joinerId: string | null }, userId: string): boolean {
  return session.creatorId === userId || session.joinerId === userId;
}

function otherUser(session: SessionWithUsers, userId: string) {
  return session.creatorId === userId ? session.joiner : session.creator;
}

function otherUserId(session: { creatorId: string; joinerId: string | null }, userId: string): string | null {
  return session.creatorId === userId ? session.joinerId : session.creatorId;
}

function stateLabel(state: SessionState): string {
  switch (state) {
    case "WAITING_FOR_OPPONENT":
      return "Waiting for an opponent";
    case "CATEGORY_SELECTION":
      return "Choosing a category";
    case "WAITING_FOR_CATEGORY_RESPONSE":
      return "Waiting for category approval";
    case "NUMBER_SELECTION":
      return "Pick a number";
    case "WAITING_FOR_ANSWER":
      return "Waiting for an answer";
    case "TRUTH_DARE_SELECTION":
      return "Choose Truth or Dare";
    case "COMPLETED":
      return "Completed";
    case "ENDED":
      return "Ended";
    case "EXPIRED":
      return "Expired";
  }
}

function userName(u?: { name: string | null; phone: string } | null): string {
  if (!u) return "Player";
  return u.name || u.phone;
}

// ============================================================
// Question counts / availability
// ============================================================

async function categoryMaxNumber(categoryId: string): Promise<number> {
  const agg = await prisma.question.aggregate({
    where: { categoryId, status: "APPROVED", number: { not: null } },
    _max: { number: true },
  });
  return agg._max.number ?? 0;
}

async function unusedQuestionOfType(categoryId: string, type: QuestionType, sessionId: string): Promise<{ id: string; text: string } | null> {
  const used = await prisma.gameMove.findMany({ where: { sessionId }, select: { questionId: true } });
  const usedIds = used.map((m) => m.questionId);
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
// Main inbound handler
// ============================================================

export type WaInbound = {
  phone: string;
  name?: string;
  text?: string;
  buttonId?: string;
  listId?: string;
  timestamp?: string;
};

type Ctx = {
  phone: string;
  userId: string;
  name?: string;
  text: string;
  session: SessionWithUsers | null;
};

export async function handleWhatsAppMessage(payload: WaInbound): Promise<void> {
  try {
    await processMessage(payload);
  } catch (err) {
    logger.error("[game] message processing failed", (err as Error).message);
    await sendText(payload.phone, messages.genericError()).catch(() => undefined);
  }
}

async function processMessage(payload: WaInbound): Promise<void> {
  const { user, created } = await getOrCreateUser(payload.phone, payload.name);
  if (created) {
    await sendText(payload.phone, messages.welcome(user.name));
  }

  const session = await getActiveSessionForUser(user.id);
  const text = payload.text ?? "";
  const ctx: Ctx = { phone: payload.phone, userId: user.id, name: user.name ?? undefined, text, session };

  // 1) Interactive (buttons / lists) — validate against current state
  if (payload.buttonId) return handleButton(ctx, payload.buttonId);
  if (payload.listId) return handleListPick(ctx, payload.listId);

  // 2) Commands take priority over state actions & answers
  const command = parseCommand(text);
  if (command) {
    await clearFlow(payload.phone);
    return handleCommand(ctx, command.name, command.arg);
  }

  // 3) Contribution / report flow steps (only when no active session)
  if (!session) {
    const flow = await getFlow(payload.phone);
    if (flow) return handleFlowStep(payload.phone, user.id, flow, text);
  }

  // 4) State-aware gameplay
  if (session) {
    if (!isParticipant(session, user.id)) {
      await clearFlow(payload.phone);
      await sendText(payload.phone, messages.noSession());
      return;
    }
    return handleState(ctx, session);
  }

  // 5) No active session
  await handleNoSession(ctx);
}

// ============================================================
// Interactive actions
// ============================================================

async function handleButton(ctx: Ctx, buttonId: string): Promise<void> {
  const { session, userId, phone } = ctx;
  if (!session) {
    await sendText(phone, messages.staleAction());
    return;
  }

  switch (buttonId) {
    case "manage":
      return showStatus(ctx, session);
    case "end_confirm":
      return sendConfirmEnd(ctx, session);
    case "end_yes":
      return endSession(ctx, session, { reason: "ended", notify: true });
    case "end_no":
      await sendText(phone, "Continuing. Your session stays active.");
      return showCurrentPrompt(ctx, session);
    case "leave_yes":
      return leaveSession(ctx, session);
    case "leave_no":
      await sendText(phone, "Good — you're staying. Your session stays active.");
      return showCurrentPrompt(ctx, session);
    case "category_accept":
      return acceptCategory(ctx, session);
    case "category_suggest":
      return startSuggestion(ctx, session);
    case "category_decline":
      return declineCategory(ctx, session);
    case "truth_tap":
      return tapTruthDare(ctx, session, QuestionType.TRUTH);
    case "dare_tap":
      return tapTruthDare(ctx, session, QuestionType.DARE);
    default:
      await sendText(phone, messages.staleAction());
  }
}

async function handleListPick(ctx: Ctx, categoryId: string): Promise<void> {
  const { session, phone, userId } = ctx;
  if (!session || session.state !== "CATEGORY_SELECTION" || session.categoryProposerId !== userId) {
    await sendText(phone, messages.staleAction());
    return;
  }
  const category = await prisma.category.findFirst({ where: { id: categoryId, status: "ACTIVE" } });
  if (!category) {
    await sendText(phone, messages.invalidCategory(categoryId));
    return;
  }
  await proposeCategory(ctx, session, category.id, category.name);
}

// ============================================================
// Commands
// ============================================================

async function handleCommand(ctx: Ctx, name: string, arg?: string): Promise<void> {
  switch (name) {
    case "start":
      return startNewGame(ctx);
    case "manage":
    case "status":
      if (!ctx.session) return reply(ctx.phone, messages.noSession());
      return showStatus(ctx, ctx.session);
    case "help":
      return reply(ctx.phone, messages.help());
    case "cancel":
      return handleCancel(ctx);
    case "end":
      if (!ctx.session) return reply(ctx.phone, messages.noSession());
      return sendConfirmEnd(ctx, ctx.session);
    case "leave":
      if (!ctx.session) return reply(ctx.phone, messages.noSession());
      return sendConfirmLeave(ctx, ctx.session);
    case "invite":
      return handleInvite(ctx);
    case "categories":
      return sendCategoryList(ctx, ctx.session?.state === "CATEGORY_SELECTION" && ctx.session.categoryProposerId === ctx.userId);
    case "random":
      return handleRandom(ctx);
    case "join": {
      if (ctx.session) return reply(ctx.phone, messages.alreadyInSession());
      const code = arg ? (extractInviteCode(arg) ?? extractInviteCode(ctx.text)) : null;
      if (code) return joinGame(ctx, code);
      return reply(ctx.phone, "Send me the *invite code* your friend shared with you. Example: /join ABC123XYZ");
    }
    case "contribute":
      if (ctx.session) return reply(ctx.phone, messages.mustEndSession());
      return startContribute(ctx, arg);
    case "report":
      if (ctx.session) return reply(ctx.phone, messages.mustEndSession());
      return startReport(ctx);
    default:
      return reply(ctx.phone, messages.unknownCommand());
  }
}

async function handleCancel(ctx: Ctx): Promise<void> {
  const { session, phone, userId } = ctx;
  if (!session) return reply(phone, messages.cancelPrompt());

  if (session.state === "WAITING_FOR_OPPONENT") {
    await endSession(ctx, session, { reason: "ended", notify: true, cancelled: true });
    return;
  }
  if (session.state === "CATEGORY_SELECTION" || session.state === "WAITING_FOR_CATEGORY_RESPONSE") {
    await prisma.session.updateMany({
      where: { id: session.id, state: session.state },
      data: { pendingCategoryId: null, categoryProposerId: session.creatorId, state: "CATEGORY_SELECTION" },
    });
    await sendText(phone, "Category choice cancelled. The session creator can choose a new one.");
    return;
  }
  await sendText(phone, messages.cancelNoActiveGame());
}

async function handleInvite(ctx: Ctx): Promise<void> {
  const { session, phone, userId } = ctx;
  if (!session) return reply(phone, "You don't have a waiting session. Use /start to create one.");
  if (session.creatorId !== userId || session.state !== "WAITING_FOR_OPPONENT") {
    return reply(phone, "You can only resend the invitation while waiting for an opponent.");
  }
  const link = await buildInviteLink(session.inviteCode);
  await sendText(phone, messages.inviteResent(session.inviteCode, link));
}

async function handleRandom(ctx: Ctx): Promise<void> {
  const { session, phone, userId } = ctx;
  if (!session || session.state !== "NUMBER_SELECTION" || session.currentTurnUserId !== userId) {
    return reply(phone, "Random selection is only available when it's your turn to pick a number.");
  }
  if (!session.categoryId) return reply(phone, messages.invalidNumber(0));
  const max = await categoryMaxNumber(session.categoryId);
  const used = await prisma.gameMove.findMany({ where: { sessionId: session.id }, select: { number: true } });
  const usedSet = new Set(used.map((m) => m.number).filter((n): n is number => n !== null));
  const available: number[] = [];
  for (let i = 1; i <= max; i++) if (!usedSet.has(i)) available.push(i);
  if (available.length === 0) return reply(phone, messages.invalidNumber(max));
  const n = available[Math.floor(Math.random() * available.length)];
  return selectNumber(ctx, session, String(n));
}

// ============================================================
// Session creation
// ============================================================

async function buildInviteLink(code: string): Promise<string> {
  const botNumber = await getSettingValue("whatsapp.number", "");
  if (!botNumber) return "";
  return waClickLink(botNumber, messages.invitationBody(code));
}

async function startNewGame(ctx: Ctx): Promise<void> {
  const { phone, userId } = ctx;
  const active = ctx.session;
  if (active) {
    await sendButtons(phone, "You already have an active 400QUES session.", [
      { id: "manage", title: "Manage session" },
      { id: "end_confirm", title: "End session" },
    ]);
    return;
  }

  const inviteCode = generateInviteCode();
  const inviteExpiry = await getNumberSetting("game.inviteExpiryMinutes", 60);
  const expiresAt = new Date(Date.now() + inviteExpiry * 60 * 1000);
  await prisma.session.create({
    data: { inviteCode, creatorId: userId, status: "WAITING", state: "WAITING_FOR_OPPONENT", expiresAt, lastActivityAt: new Date() },
  });
  await clearFlow(phone);

  const link = await buildInviteLink(inviteCode);
  await sendText(phone, messages.sessionCreated(inviteCode, link));
  logger.info("[game] session created", { inviteCode });
}

// ============================================================
// Join session (transactional)
// ============================================================

const INVITE_CODE_RE = /\b[A-HJ-NP-Z2-9]{8,14}\b/;

function extractInviteCode(text: string): string | null {
  const m = text.toUpperCase().match(INVITE_CODE_RE);
  return m ? m[0] : null;
}

async function handleNoSession(ctx: Ctx): Promise<void> {
  const { phone, text } = ctx;
  if (!text.trim()) return;
  const code = extractInviteCode(text);
  if (code) return joinGame(ctx, code);
  await sendText(phone, messages.noSession());
}

async function joinGame(ctx: Ctx, rawCode: string): Promise<void> {
  const { phone, userId } = ctx;
  const code = rawCode.trim().toUpperCase();
  const session = await prisma.session.findUnique({ where: { inviteCode: code } });

  if (!session) return reply(phone, messages.invalidInvitation());
  if (session.creatorId === userId) return reply(phone, messages.selfJoin());

  const active = await getActiveSessionForUser(userId);
  if (active && active.id !== session.id) return reply(phone, messages.alreadyInSession());

  if (session.status !== "WAITING" || session.state !== "WAITING_FOR_OPPONENT") {
    if (session.state === "EXPIRED") return reply(phone, messages.expiredInvitation());
    return reply(phone, messages.invalidInvitation());
  }
  if (session.expiresAt && session.expiresAt < new Date()) {
    await prisma.session.updateMany({
      where: { id: session.id, status: "WAITING" },
      data: { status: "ABANDONED", state: "EXPIRED", finishedAt: new Date() },
    });
    return reply(phone, messages.expiredInvitation());
  }

  // Atomic claim: only one concurrent join can flip WAITING -> ACTIVE.
  const claimed = await prisma.$transaction(async (tx) => {
    const res = await tx.session.updateMany({
      where: { id: session.id, status: "WAITING", joinerId: null, state: "WAITING_FOR_OPPONENT" },
      data: {
        joinerId: userId,
        status: "ACTIVE",
        state: "CATEGORY_SELECTION",
        categoryProposerId: session.creatorId,
        startedAt: new Date(),
        expiresAt: null,
        lastActivityAt: new Date(),
      },
    });
    if (res.count === 1) {
      await tx.user.updateMany({ where: { id: { in: [session.creatorId, userId] } }, data: { totalSessions: { increment: 1 } } });
    }
    return res.count;
  });

  if (claimed === 0) return reply(phone, messages.invalidInvitation());

  const creator = await prisma.user.findUnique({ where: { id: session.creatorId } });
  const joiner = ctx.name ? ctx.name : undefined;
  await clearFlow(phone);
  await sendText(phone, messages.joined());
  if (creator) {
    await sendText(creator.phone, messages.opponentJoined(joiner));
    await sendText(creator.phone, messages.bothConnected());
    await sendText(creator.phone, messages.chooseCategory());
  }
  await sendText(phone, messages.opponentChoosingCategory());
  logger.info("[game] session joined", { sessionId: session.id });
}

// ============================================================
// Category selection / proposal / accept / suggest / decline
// ============================================================

async function sendCategoryList(ctx: Ctx, pickMode: boolean): Promise<void> {
  const { phone } = ctx;
  const categories = await prisma.category.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ playCount: "desc" }, { name: "asc" }],
    take: 10,
    select: { id: true, name: true, description: true },
  });
  if (categories.length === 0) {
    await sendText(phone, "No categories available yet. Check back soon!");
    return;
  }
  const header = pickMode ? "Pick a category" : "Available Categories 📚";
  const footer = "Play 400QUES with a friend 🎮";
  const rows = categories.map((c) => ({ id: c.id, title: c.name, description: (c.description ?? "").slice(0, 72) }));
  await sendList(phone, header, "See categories", rows, { footer });
}

async function handleState(ctx: Ctx, session: SessionWithUsers): Promise<void> {
  const { phone, userId, text } = ctx;

  switch (session.state) {
    case "WAITING_FOR_OPPONENT":
      return reply(phone, messages.waitingForOpponent());

    case "CATEGORY_SELECTION":
      if (session.categoryProposerId !== userId) return reply(phone, messages.opponentChoosingCategory());
      return pickCategory(ctx, session, text);

    case "WAITING_FOR_CATEGORY_RESPONSE":
      if (session.categoryProposerId === userId) {
        return reply(phone, "Waiting for your opponent's response to your category proposal.");
      }
      return reply(phone, "Use the buttons on the category proposal to accept, suggest another, or decline.");

    case "NUMBER_SELECTION":
      if (session.currentTurnUserId !== userId) return reply(phone, messages.notYourTurn());
      return selectNumber(ctx, session, text);

    case "TRUTH_DARE_SELECTION":
      if (session.currentTurnUserId !== userId) return reply(phone, messages.notYourTurn());
      return reply(phone, "Use the TRUTH-TAP or DARE-TAP button to choose.");

    case "WAITING_FOR_ANSWER":
      return handleAnswer(ctx, session, text);

    default:
      return reply(phone, messages.noSession());
  }
}

async function pickCategory(ctx: Ctx, session: SessionWithUsers, raw: string): Promise<void> {
  const { phone, userId } = ctx;
  const text = cleanText(raw);
  if (!text) return reply(phone, messages.chooseCategory());

  const byId = await prisma.category.findFirst({ where: { id: text, status: "ACTIVE" } });
  const category = byId ?? (await prisma.category.findFirst({ where: { status: "ACTIVE", name: { contains: text, mode: "insensitive" } } }));
  if (!category) return reply(phone, messages.invalidCategory(text));

  await proposeCategory(ctx, session, category.id, category.name);
}

async function proposeCategory(ctx: Ctx, session: SessionWithUsers, categoryId: string, name: string): Promise<void> {
  const { phone, userId } = ctx;
  const claimed = await prisma.$transaction(async (tx) => {
    const res = await tx.session.updateMany({
      where: { id: session.id, state: "CATEGORY_SELECTION", categoryProposerId: userId },
      data: { pendingCategoryId: categoryId, categoryProposerId: userId, state: "WAITING_FOR_CATEGORY_RESPONSE", lastActivityAt: new Date() },
    });
    if (res.count === 1) {
      const history = Array.isArray(session.proposalHistory) ? (session.proposalHistory as unknown[]) : [];
      await tx.session.update({
        where: { id: session.id },
        data: { proposalHistory: [...history, { categoryId, name, proposedBy: userId, at: new Date().toISOString() }] as Prisma.InputJsonValue },
      });
    }
    return res.count;
  });
  if (claimed === 0) return reply(phone, messages.staleAction());

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return;
  const opponent = otherUser(session, userId);
  const count = await categoryMaxNumber(categoryId);
  const typeLabel = category.gameType === "TRUTH_DARE" ? "Truth or Dare" : "Questions";

  if (opponent) {
    await sendButtons(
      opponent.phone,
      messages.categoryProposal(category.name, category.description ?? "", count, typeLabel),
      [
        { id: "category_accept", title: "Accept" },
        { id: "category_suggest", title: "Suggest another" },
        { id: "category_decline", title: "Decline" },
      ]
    );
  }
  await sendText(phone, messages.proposalSent(category.name));
  logger.info("[game] category proposed", { sessionId: session.id, categoryId });
}

async function acceptCategory(ctx: Ctx, session: SessionWithUsers): Promise<void> {
  const { phone, userId } = ctx;
  if (session.state !== "WAITING_FOR_CATEGORY_RESPONSE" || session.categoryProposerId === userId) {
    return reply(phone, messages.staleAction());
  }
  const pending = session.pendingCategoryId;
  if (!pending) return reply(phone, messages.staleAction());

  const category = await prisma.category.findUnique({ where: { id: pending } });
  if (!category) return reply(phone, messages.staleAction());

  const targetState: SessionState = category.gameType === "TRUTH_DARE" ? "TRUTH_DARE_SELECTION" : "NUMBER_SELECTION";
  const claimed = await prisma.session.updateMany({
    where: { id: session.id, state: "WAITING_FOR_CATEGORY_RESPONSE", categoryProposerId: { not: userId } },
    data: {
      categoryId: pending,
      pendingCategoryId: null,
      categoryProposerId: null,
      round: 1,
      currentTurnUserId: session.creatorId,
      state: targetState,
      lastActivityAt: new Date(),
    },
  });
  if (claimed.count === 0) return reply(phone, messages.staleAction());

  const count = await categoryMaxNumber(pending);
  const both = [session.creator, session.joiner].filter(Boolean);
  for (const u of both) {
    if (u) await sendText(u.phone, messages.categoryAccepted(category.name, count));
  }
  await promptNumberOrTap(ctx, session.creatorId, targetState, count, session.creator.name);
  logger.info("[game] category accepted", { sessionId: session.id, categoryId: pending });
}

async function startSuggestion(ctx: Ctx, session: SessionWithUsers): Promise<void> {
  const { phone, userId } = ctx;
  if (session.state !== "WAITING_FOR_CATEGORY_RESPONSE" || session.categoryProposerId === userId) {
    return reply(phone, messages.staleAction());
  }
  const claimed = await prisma.session.updateMany({
    where: { id: session.id, state: "WAITING_FOR_CATEGORY_RESPONSE", categoryProposerId: { not: userId } },
    data: { pendingCategoryId: null, categoryProposerId: userId, state: "CATEGORY_SELECTION", lastActivityAt: new Date() },
  });
  if (claimed.count === 0) return reply(phone, messages.staleAction());
  await sendText(phone, "Great! Pick a category to suggest to your opponent.");
  await sendCategoryList(ctx, true);
}

async function declineCategory(ctx: Ctx, session: SessionWithUsers): Promise<void> {
  const { phone, userId } = ctx;
  if (session.state !== "WAITING_FOR_CATEGORY_RESPONSE" || session.categoryProposerId === userId) {
    return reply(phone, messages.staleAction());
  }
  const declinedName = session.pendingCategoryId
    ? (await prisma.category.findUnique({ where: { id: session.pendingCategoryId } }))?.name ?? "the category"
    : "the category";

  const claimed = await prisma.session.updateMany({
    where: { id: session.id, state: "WAITING_FOR_CATEGORY_RESPONSE", categoryProposerId: { not: userId } },
    data: { pendingCategoryId: null, categoryProposerId: session.creatorId, state: "CATEGORY_SELECTION", lastActivityAt: new Date() },
  });
  if (claimed.count === 0) return reply(phone, messages.staleAction());

  const proposer = session.categoryProposerId === session.creatorId ? session.creator : session.joiner;
  if (proposer) await sendText(proposer.phone, messages.categoryDeclined(declinedName));
  await sendText(phone, messages.categoryDeclinedByCreator());
}

// ============================================================
// Number selection
// ============================================================

async function promptNumberOrTap(ctx: Ctx, userId: string, targetState: SessionState, count: number, askerName?: string | null): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  if (targetState === "TRUTH_DARE_SELECTION") {
    await sendButtons(user.phone, messages.truthDareSelection(), [
      { id: "truth_tap", title: "TRUTH-TAP" },
      { id: "dare_tap", title: "DARE-TAP" },
    ]);
    return;
  }
  await sendText(user.phone, messages.pickNumber(count, askerName ?? user.name));
}

async function selectNumber(ctx: Ctx, session: SessionWithUsers, raw: string): Promise<void> {
  const { phone, userId } = ctx;
  if (session.state !== "NUMBER_SELECTION" || session.currentTurnUserId !== userId) {
    return reply(phone, messages.notYourTurn());
  }
  if (!session.categoryId) return reply(phone, messages.genericError());

  const text = cleanText(raw);
  if (!/^\d+$/.test(text)) {
    const max = await categoryMaxNumber(session.categoryId);
    return reply(phone, messages.invalidNumber(max));
  }
  const n = Number(text);
  const max = await categoryMaxNumber(session.categoryId);
  if (n < 1 || n > max) return reply(phone, messages.invalidNumber(max));

  const question = await prisma.question.findFirst({ where: { categoryId: session.categoryId, number: n, status: "APPROVED" } });
  if (!question) {
    logger.warn("[game] question number missing", { sessionId: session.id, number: n });
    return reply(phone, messages.questionLoadError());
  }

  const answererId = otherUserId(session, userId);
  if (!answererId) return reply(phone, messages.genericError());

  try {
    const claimed = await prisma.$transaction(async (tx) => {
      const res = await tx.session.updateMany({
        where: { id: session.id, state: "NUMBER_SELECTION", currentTurnUserId: userId },
        data: { currentQuestionId: question.id, currentNumber: n, state: "WAITING_FOR_ANSWER", lastActivityAt: new Date() },
      });
      if (res.count === 0) return 0;
      await tx.gameMove.create({
        data: {
          sessionId: session.id,
          questionId: question.id,
          round: session.round,
          number: n,
          askedBy: userId,
          answeredBy: answererId,
          type: question.type,
          status: "PENDING_ANSWER",
        },
      });
      await tx.question.update({ where: { id: question.id }, data: { playsCount: { increment: 1 } } });
      return 1;
    });
    if (claimed === 0) return reply(phone, messages.staleAction());
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return reply(phone, messages.duplicateNumber(n));
    }
    throw err;
  }

  const asker = await prisma.user.findUnique({ where: { id: userId } });
  const answerer = await prisma.user.findUnique({ where: { id: answererId } });
  const round = session.round;
  const questionMsg = messages.question(round, userName(asker), n, question.text, userName(asker), userName(answerer));
  await sendText(phone, questionMsg);
  if (answerer) await sendText(answerer.phone, questionMsg);
  logger.info("[game] number selected", { sessionId: session.id, number: n });
}

// ============================================================
// Truth / Dare
// ============================================================

async function tapTruthDare(ctx: Ctx, session: SessionWithUsers, type: QuestionType): Promise<void> {
  const { phone, userId } = ctx;
  if (session.state !== "TRUTH_DARE_SELECTION" || session.currentTurnUserId !== userId) {
    return reply(phone, messages.staleAction());
  }
  if (!session.categoryId) return reply(phone, messages.genericError());

  const question = await unusedQuestionOfType(session.categoryId, type, session.id);
  if (!question) {
    const otherType: QuestionType = type === "TRUTH" ? "DARE" : "TRUTH";
    const fallback = await unusedQuestionOfType(session.categoryId, otherType, session.id);
    const msg = type === "TRUTH" ? messages.noUnusedTruth() : messages.noUnusedDare();
    if (fallback) {
      await sendButtons(
        phone,
        `${msg}\n\nThere are still unused ${otherType} questions left.`,
        [{ id: otherType === "TRUTH" ? "truth_tap" : "dare_tap", title: `${otherType}-TAP` }]
      );
      return;
    }
    return finishGame(ctx, session, { exhausted: true });
  }

  const answererId = otherUserId(session, userId);
  if (!answererId) return reply(phone, messages.genericError());

  try {
    const claimed = await prisma.$transaction(async (tx) => {
      const res = await tx.session.updateMany({
        where: { id: session.id, state: "TRUTH_DARE_SELECTION", currentTurnUserId: userId },
        data: { currentQuestionId: question.id, state: "WAITING_FOR_ANSWER", lastActivityAt: new Date() },
      });
      if (res.count === 0) return 0;
      await tx.gameMove.create({
        data: {
          sessionId: session.id,
          questionId: question.id,
          round: session.round,
          askedBy: userId,
          answeredBy: answererId,
          type,
          status: "PENDING_ANSWER",
        },
      });
      await tx.question.update({ where: { id: question.id }, data: { playsCount: { increment: 1 } } });
      return 1;
    });
    if (claimed === 0) return reply(phone, messages.staleAction());
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return reply(phone, type === "TRUTH" ? messages.noUnusedTruth() : messages.noUnusedDare());
    }
    throw err;
  }

  const asker = await prisma.user.findUnique({ where: { id: userId } });
  const answerer = await prisma.user.findUnique({ where: { id: answererId } });
  const typeLabel = type === "TRUTH" ? "TRUTH" : "DARE";
  const msg = messages.truthDarePicked(typeLabel, session.round, userName(asker), question.text, userName(asker), userName(answerer));
  await sendText(phone, msg);
  if (answerer) await sendText(answerer.phone, msg);
  logger.info("[game] truth/dare selected", { sessionId: session.id, type });
}

// ============================================================
// Answer
// ============================================================

async function handleAnswer(ctx: Ctx, session: SessionWithUsers, raw: string): Promise<void> {
  const { phone, userId } = ctx;
  if (session.state !== "WAITING_FOR_ANSWER") return reply(phone, messages.staleAction());

  const askerId = session.currentTurnUserId;
  if (askerId === userId) return reply(phone, messages.askerWait());
  if (askerId && otherUserId(session, userId) !== askerId) return reply(phone, messages.notYourTurn());

  const text = cleanText(raw);
  if (!text) return reply(phone, messages.genericError());

  const claimed = await prisma.$transaction(async (tx) => {
    const res = await tx.gameMove.updateMany({
      where: { sessionId: session.id, round: session.round, status: "PENDING_ANSWER", answeredBy: userId },
      data: { answer: text, status: "ANSWERED", answeredAt: new Date() },
    });
    if (res.count === 1) {
      await tx.session.updateMany({
        where: { id: session.id, state: "WAITING_FOR_ANSWER" },
        data: { turnsPlayed: { increment: 1 }, lastActivityAt: new Date() },
      });
    }
    return res.count;
  });
  if (claimed === 0) {
    logger.warn("[game] answer rejected (no pending move)", { sessionId: session.id, round: session.round });
    return reply(phone, messages.genericError());
  }

  await prisma.user.update({ where: { id: userId }, data: { totalAnswered: { increment: 1 } } });
  const asker = askerId ? await prisma.user.findUnique({ where: { id: askerId } }) : null;
  if (asker) await sendText(asker.phone, messages.answerForward(userName(await prisma.user.findUnique({ where: { id: userId } })), text));
  await sendText(phone, messages.answerRecorded());

  const fresh = await prisma.session.findUnique({ where: { id: session.id }, include: { category: true } });
  if (!fresh) return;

  const roundsPerPlayer = await getNumberSetting("game.roundsPerPlayer", 5);
  if (fresh.turnsPlayed >= roundsPerPlayer * 2) {
    return finishGame(ctx, session, {});
  }

  const remaining = await remainingQuestionCount(fresh);
  if (remaining === 0) {
    return finishGame(ctx, session, { exhausted: true });
  }

  // Swap roles and advance round.
  const nextAskerId = userId;
  const nextState: SessionState = fresh.category?.gameType === "TRUTH_DARE" ? "TRUTH_DARE_SELECTION" : "NUMBER_SELECTION";
  const swapped = await prisma.session.updateMany({
    where: { id: session.id, state: "WAITING_FOR_ANSWER" },
    data: { state: nextState, round: { increment: 1 }, currentTurnUserId: nextAskerId, lastActivityAt: new Date() },
  });
  if (swapped.count === 0) return;

  await promptNumberOrTap(ctx, nextAskerId, nextState, remaining, userName(await prisma.user.findUnique({ where: { id: nextAskerId } })));
  logger.info("[game] turn changed", { sessionId: session.id, round: fresh.round + 1 });
}

async function remainingQuestionCount(session: { id: string; categoryId: string | null; category?: { gameType: string } | null }): Promise<number> {
  if (!session.categoryId) return 0;
  const used = await prisma.gameMove.findMany({ where: { sessionId: session.id }, select: { questionId: true, number: true } });
  const usedIds = used.map((m) => m.questionId);
  if (session.category?.gameType === "TRUTH_DARE") {
    return prisma.question.count({
      where: { categoryId: session.categoryId, status: "APPROVED", ...(usedIds.length ? { id: { notIn: usedIds } } : {}) },
    });
  }
  const max = await categoryMaxNumber(session.categoryId);
  const usedNumbers = new Set(used.map((m) => m.number).filter((n): n is number => n !== null));
  return Math.max(0, max - usedNumbers.size);
}

// ============================================================
// Finish / end / leave
// ============================================================

async function finishGame(ctx: Ctx, session: SessionWithUsers, opts: { exhausted?: boolean }): Promise<void> {
  const moves = await prisma.gameMove.findMany({ where: { sessionId: session.id } });
  const askedCount = new Map<string, number>();
  for (const m of moves) askedCount.set(m.askedBy, (askedCount.get(m.askedBy) ?? 0) + 1);
  const winnerId = [...askedCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? session.creatorId;

  const claimed = await prisma.session.updateMany({
    where: { id: session.id, status: "ACTIVE" },
    data: { status: "COMPLETED", state: "COMPLETED", finishedAt: new Date(), winnerId },
  });
  if (claimed.count === 0) return;

  if (session.categoryId) {
    await prisma.category.updateMany({ where: { id: session.categoryId }, data: { playCount: { increment: 1 } } });
  }

  const winner = await prisma.user.findUnique({ where: { id: winnerId } });
  const summary = opts.exhausted
    ? messages.exhausted()
    : messages.gameOver(moves.length, userName(winner), askedCount.get(winnerId) ?? 0);

  for (const u of [session.creator, session.joiner]) {
    if (u) await sendText(u.phone, summary);
  }
  logger.info("[game] session finished", { sessionId: session.id });
}

async function endSession(
  ctx: Ctx,
  session: SessionWithUsers,
  opts: { reason: "ended" | "expired"; notify: boolean; leaverId?: string; cancelled?: boolean }
): Promise<void> {
  const claimed = await prisma.session.updateMany({
    where: { id: session.id, status: { in: ["WAITING", "ACTIVE"] } },
    data: {
      status: "ABANDONED",
      state: opts.reason === "expired" ? "EXPIRED" : "ENDED",
      finishedAt: new Date(),
      leaverId: opts.leaverId ?? session.leaverId,
    },
  });
  if (claimed.count === 0) return;

  if (opts.notify) {
    const leaver = opts.leaverId ? (opts.leaverId === session.creatorId ? session.creator : session.joiner) : null;
    const remaining = opts.leaverId ? (opts.leaverId === session.creatorId ? session.joiner : session.creator) : null;
    for (const u of [session.creator, session.joiner]) {
      if (!u) continue;
      if (leaver && u.id === leaver.id) {
        await sendText(u.phone, messages.sessionEnded());
      } else if (remaining) {
        await sendText(u.phone, messages.playerLeft(userName(leaver)));
      } else {
        await sendText(u.phone, opts.cancelled ? "Your session was cancelled." : messages.sessionEnded());
      }
    }
  }
  logger.info("[game] session ended", { sessionId: session.id, reason: opts.reason });
}

async function leaveSession(ctx: Ctx, session: SessionWithUsers): Promise<void> {
  await endSession(ctx, session, { reason: "ended", notify: true, leaverId: ctx.userId });
}

async function sendConfirmEnd(ctx: Ctx, session: SessionWithUsers): Promise<void> {
  await sendButtons(ctx.phone, messages.confirmEnd(), [
    { id: "end_yes", title: "YES, END SESSION" },
    { id: "end_no", title: "NO, KEEP PLAYING" },
  ]);
}

async function sendConfirmLeave(ctx: Ctx, session: SessionWithUsers): Promise<void> {
  await sendButtons(ctx.phone, messages.confirmLeave(), [
    { id: "leave_yes", title: "YES, LEAVE" },
    { id: "leave_no", title: "NO, STAY" },
  ]);
}

// ============================================================
// Status / resume
// ============================================================

async function showCurrentPrompt(ctx: Ctx, session: SessionWithUsers): Promise<void> {
  const { phone, userId } = ctx;
  switch (session.state) {
    case "WAITING_FOR_OPPONENT":
      return reply(phone, messages.waitingForOpponent());
    case "CATEGORY_SELECTION":
      if (session.categoryProposerId === userId) return reply(phone, messages.chooseCategory());
      return reply(phone, messages.opponentChoosingCategory());
    case "WAITING_FOR_CATEGORY_RESPONSE":
      return reply(phone, "Waiting for category approval.");
    case "NUMBER_SELECTION":
      if (session.currentTurnUserId !== userId) return reply(phone, messages.notYourTurn());
      return reply(phone, "Pick an unused number to continue.");
    case "TRUTH_DARE_SELECTION":
      if (session.currentTurnUserId !== userId) return reply(phone, messages.notYourTurn());
      return reply(phone, "Choose TRUTH-TAP or DARE-TAP to continue.");
    case "WAITING_FOR_ANSWER":
      if (session.currentTurnUserId === userId) return reply(phone, messages.askerWait());
      return reply(phone, "Reply with your answer to continue.");
    default:
      return reply(phone, messages.noSession());
  }
}

async function showStatus(ctx: Ctx, session: SessionWithUsers): Promise<void> {
  const { phone, userId } = ctx;
  const opponent = otherUser(session, userId);
  const pendingCategory = session.pendingCategoryId ? await prisma.category.findUnique({ where: { id: session.pendingCategoryId } }) : null;
  const turnPlayer = session.currentTurnUserId ? await prisma.user.findUnique({ where: { id: session.currentTurnUserId } }) : null;
  const isAnswererWait = session.state === "WAITING_FOR_ANSWER" && session.currentTurnUserId !== userId;

  const msg = messages.resume({
    categoryName: session.category?.name ?? pendingCategory?.name ?? null,
    round: session.round,
    stateLabel: isAnswererWait ? "Waiting for your answer" : stateLabel(session.state),
    opponentName: userName(opponent),
    turnPlayerName: turnPlayer ? userName(turnPlayer) : null,
    pendingQuestion: session.currentQuestion?.text ?? null,
  });
  await sendText(phone, msg);
}

// ============================================================
// Contribution / report flows (retained, gated to no active session)
// ============================================================

async function startContribute(ctx: Ctx, questionText?: string): Promise<void> {
  const { phone } = ctx;
  if (questionText && questionText.trim().length >= 3) {
    await setFlow(phone, { step: "contribute_category", pendingQuestion: questionText.trim() });
    const categories = await prisma.category.findMany({ where: { status: "ACTIVE" }, take: 10, orderBy: { playCount: "desc" }, select: { name: true } });
    return reply(
      phone,
      `Question: *"${questionText.slice(0, 120)}"*\n\nWhich category?\n\n${categories.map((c, i) => `${i + 1}. ${c.name}`).join("\n")}\n\nType the category name or *CANCEL* to abort.`
    );
  }
  await setFlow(phone, { step: "contribute_text" });
  await sendText(phone, "Awesome! What question would you like to add?\n\nType the question text, or *CANCEL* to abort.");
}

async function startReport(ctx: Ctx): Promise<void> {
  const { phone } = ctx;
  await setFlow(phone, { step: "report_text" });
  await sendText(phone, "Report a question. Please paste the question text that is a problem, or *CANCEL* to abort.");
}

async function handleFlowStep(phone: string, userId: string, flow: FlowStep, raw: string): Promise<void> {
  const text = cleanText(raw);
  const upper = text.toUpperCase();

  if (flow.step === "contribute_text") {
    if (upper === "CANCEL" || upper === "EXIT") {
      await clearFlow(phone);
      return reply(phone, "Contribution cancelled.");
    }
    if (text.length < 3) return reply(phone, "That is too short. Please type the full question, or *CANCEL* to abort.");
    await setFlow(phone, { step: "contribute_category", pendingQuestion: text });
    const categories = await prisma.category.findMany({ where: { status: "ACTIVE" }, take: 10, orderBy: { playCount: "desc" }, select: { name: true } });
    return reply(
      phone,
      `Got it: *"${text.slice(0, 120)}"*\n\nWhich category should it go in?\n\n${categories.map((c, i) => `${i + 1}. ${c.name}`).join("\n")}\n\nType the category name or *CANCEL* to abort.`
    );
  }

  if (flow.step === "contribute_category") {
    if (upper === "CANCEL") {
      await clearFlow(phone);
      return reply(phone, "Contribution cancelled.");
    }
    const questionText = flow.pendingQuestion;
    if (!questionText) {
      await clearFlow(phone);
      return reply(phone, "Something went wrong. Send /contribute to start over.");
    }
    const category = await prisma.category.findFirst({ where: { status: "ACTIVE", name: { contains: text, mode: "insensitive" } } });
    if (!category) return reply(phone, `Could not find category *${text}*. Try again or *CANCEL*.`);
    await clearFlow(phone);
    const outcome = await submitContribution({ userPhone: phone, userId, categoryId: category.id, question: questionText });
    return reply(phone, `📝 ${outcome.message}`);
  }

  if (flow.step === "report_text") {
    if (upper === "CANCEL") {
      await clearFlow(phone);
      return reply(phone, "Report cancelled.");
    }
    await setFlow(phone, { step: "report_reason", pendingReportQuestion: text });
    return reply(phone, "What is the reason?\n\nReply with one of: *DUPLICATE*, *INAPPROPRIATE*, *SPAM*, *WRONG*, *OTHER*");
  }

  if (flow.step === "report_reason") {
    const questionText = flow.pendingReportQuestion;
    if (!questionText) {
      await clearFlow(phone);
      return reply(phone, "Something went wrong. Send /report to start over.");
    }
    const reasonMap: Record<string, "DUPLICATE" | "INAPPROPRIATE" | "SPAM" | "WRONG_ANSWER" | "OTHER"> = {
      DUPLICATE: "DUPLICATE",
      INAPPROPRIATE: "INAPPROPRIATE",
      SPAM: "SPAM",
      WRONG: "WRONG_ANSWER",
      OTHER: "OTHER",
    };
    const reason = reasonMap[upper];
    if (upper === "CANCEL") {
      await clearFlow(phone);
      return reply(phone, "Report cancelled.");
    }
    if (!reason) return reply(phone, "Please reply *DUPLICATE*, *INAPPROPRIATE*, *SPAM*, *WRONG* or *OTHER*.");

    const question = await prisma.question.findFirst({ where: { text: { contains: questionText.slice(0, 60), mode: "insensitive" } } });
    const ticket = `RPT-${generateInviteCode().slice(0, 6)}`;
    await prisma.questionReport.create({
      data: {
        ticket,
        categoryId: question?.categoryId ?? "",
        questionId: question?.id ?? null,
        reporterPhone: phone,
        reason,
        notes: `Question: ${questionText}`,
      },
    });
    if (question) await prisma.question.update({ where: { id: question.id }, data: { reportCount: { increment: 1 } } });
    await clearFlow(phone);
    await sendText(phone, `Thanks, report received. Our team will review it. 🛡️\n\nTicket: *${ticket}*`);
  }
}
