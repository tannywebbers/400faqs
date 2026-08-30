process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/400faqs";
process.env.REDIS_URL = "redis://localhost:6379";

import { Prisma } from "@prisma/client";
import { prisma } from "@400faqs/db";
import { handleWhatsAppMessage, getOrCreateUser } from "./src/services/game";

let pass = 0;
let fail = 0;
function assert(cond: boolean, name: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra !== undefined ? " :: " + JSON.stringify(extra) : ""}`);
  }
}

const norm = (s: string): string => s.replace(/\D/g, "");

async function newGame(userId: string): Promise<{ code: string; sessionId: string }> {
  await handleWhatsAppMessage({ phone: userId, name: userId });
  const s = await prisma.session.findFirst({ where: { creatorId: userId, status: "WAITING" }, orderBy: { createdAt: "desc" } });
  if (!s) throw new Error("no waiting session created");
  return { code: s.inviteCode, sessionId: s.id };
}

async function join(code: string, joinerPhone: string): Promise<void> {
  await handleWhatsAppMessage({ phone: joinerPhone, name: joinerPhone, text: `Join my 400faqs game 🎮\n\nSession: ${code}` });
}

async function main(): Promise<void> {
  console.log("== cleanup + seed ==");
  await prisma.gameMove.deleteMany({});
  await prisma.processedEvent.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.setting.deleteMany({});
  await prisma.setting.createMany({
    data: [
      { key: "game.inviteExpiryMinutes", value: "60", type: "number", group: "game", description: "", public: false },
      { key: "game.turnTimeoutMinutes", value: "5", type: "number", group: "game", description: "", public: false },
      { key: "game.roundsPerPlayer", value: "5", type: "number", group: "game", description: "", public: false },
      { key: "whatsapp.number", value: "", type: "string", group: "whatsapp", description: "", public: true },
    ],
  });

  console.log("== users ==");
  const A = await getOrCreateUser("+15550000001", "Alice");
  const B = await getOrCreateUser("+15550000002", "Bob");
  assert(A.created && B.created, "A and B created as new users");

  console.log("== categories + questions ==");
  const catN = await prisma.category.create({ data: { name: "General Knowledge", slug: "general-knowledge", description: "GK", status: "ACTIVE" } });
  for (let i = 1; i <= 5; i++) {
    await prisma.question.create({ data: { categoryId: catN.id, number: i, text: `GK Question ${i}`, type: "NORMAL", status: "APPROVED", source: "ADMIN" } });
  }
  const catTD = await prisma.category.create({ data: { name: "Truth or Dare", slug: "truth-or-dare", description: "TD", status: "ACTIVE", gameType: "TRUTH_DARE" } });
  await prisma.question.create({ data: { categoryId: catTD.id, text: "TRUTH Q1", type: "TRUTH", status: "APPROVED", source: "ADMIN" } });
  await prisma.question.create({ data: { categoryId: catTD.id, text: "DARE Q1", type: "DARE", status: "APPROVED", source: "ADMIN" } });

  console.log("== 1. session create + duplicate /start ==");
  const p1 = { phone: A.user.phone, name: "Alice" };
  await handleWhatsAppMessage(p1); // welcome
  await handleWhatsAppMessage({ ...p1, text: "/start" });
  let s1 = await prisma.session.findFirst({ where: { creatorId: A.user.id } });
  assert(!!s1 && s1.state === "WAITING_FOR_OPPONENT" && s1.status === "WAITING", "session created WAITING_FOR_OPPONENT", s1);
  const code1 = s1!.inviteCode;
  await handleWhatsAppMessage({ ...p1, text: "/start" });
  const waitCount = await prisma.session.count({ where: { creatorId: A.user.id, status: "WAITING" } });
  assert(waitCount === 1, "second /start does not create a second session");

  console.log("== 2. join (inline invite text) ==");
  await join(code1, B.user.phone);
  s1 = await prisma.session.findUnique({ where: { id: s1!.id }, include: { creator: true, joiner: true } });
  assert(!!s1 && s1.status === "ACTIVE" && s1.state === "CATEGORY_SELECTION", "join flips to ACTIVE/CATEGORY_SELECTION", { status: s1?.status, state: s1?.state });
  assert(s1!.joinerId === B.user.id && s1!.categoryProposerId === A.user.id, "joinerId + categoryProposerId set", { joinerId: s1!.joinerId, prop: s1!.categoryProposerId });
  const aUser = await prisma.user.findUnique({ where: { id: A.user.id } });
  const bUser = await prisma.user.findUnique({ where: { id: B.user.id } });
  assert(aUser!.totalSessions === 1 && bUser!.totalSessions === 1, "both totalSessions incremented", { a: aUser!.totalSessions, b: bUser!.totalSessions });

  console.log("== 3. self-join + already-in-session ==");
  const a2 = await getOrCreateUser("+15550000003", "Carol");
  await join(code1, A.user.phone); // self-join
  const selfJoinOk = await prisma.session.count({ where: { id: s1!.id, status: "ACTIVE" } });
  assert(selfJoinOk === 1, "self-join rejected (session unchanged)");
  await join(code1, a2.user.phone); // carol joins active session
  assert((await prisma.session.count({ where: { id: s1!.id, status: "ACTIVE" } })) === 1, "join into ACTIVE session rejected");
  assert((await prisma.session.count({ where: { joinerId: a2.user.id } })) === 0, "carol has no session");

  console.log("== 4. category proposal via listId ==");
  await handleWhatsAppMessage({ ...p1, listId: catN.id });
  s1 = await prisma.session.findUnique({ where: { id: s1!.id } });
  assert(s1!.state === "WAITING_FOR_CATEGORY_RESPONSE" && s1!.pendingCategoryId === catN.id, "proposal stored, state WAITING_FOR_CATEGORY_RESPONSE", s1!.state);
  assert(Array.isArray(s1!.proposalHistory) && (s1!.proposalHistory as unknown[]).length === 1, "proposalHistory recorded");

  console.log("== 5. stale list pick (joiner not proposer) ==");
  await handleWhatsAppMessage({ phone: B.user.phone, name: "Bob", listId: catN.id });
  const stillResp = await prisma.session.findUnique({ where: { id: s1!.id } });
  assert(stillResp!.state === "WAITING_FOR_CATEGORY_RESPONSE", "stale list pick ignored");

  console.log("== 6. opponent accepts category ==");
  await handleWhatsAppMessage({ phone: B.user.phone, name: "Bob", buttonId: "category_accept" });
  s1 = await prisma.session.findUnique({ where: { id: s1!.id }, include: { category: true } });
  assert(s1!.state === "NUMBER_SELECTION" && s1!.categoryId === catN.id && s1!.currentTurnUserId === A.user.id, "accept → NUMBER_SELECTION, creator to pick", s1!.state);

  console.log("== 7. pick number (valid) ==");
  await handleWhatsAppMessage({ ...p1, text: "2" });
  s1 = await prisma.session.findUnique({ where: { id: s1!.id }, include: { currentQuestion: true } });
  const m1 = await prisma.gameMove.findFirst({ where: { sessionId: s1!.id } });
  assert(s1!.state === "WAITING_FOR_ANSWER" && s1!.currentNumber === 2 && s1!.currentQuestionId === m1!.questionId, "number 2 selected → WAITING_FOR_ANSWER", s1!.state);
  assert(m1!.number === 2 && m1!.askedBy === A.user.id && m1!.answeredBy === B.user.id && m1!.status === "PENDING_ANSWER" && m1!.round === 1, "GameMove recorded (asker/answerer/round)", m1);

  console.log("== 8. asker cannot answer own question ==");
  await handleWhatsAppMessage({ ...p1, text: "my own answer" });
  assert((await prisma.gameMove.count({ where: { sessionId: s1!.id, status: { not: "PENDING_ANSWER" } } })) === 0, "asker answer rejected (move still PENDING_ANSWER)");

  console.log("== 9. answerer answers ==");
  await handleWhatsAppMessage({ phone: B.user.phone, name: "Bob", text: "The answer is 42" });
  const m1b = await prisma.gameMove.findFirst({ where: { sessionId: s1!.id } });
  s1 = await prisma.session.findUnique({ where: { id: s1!.id } });
  assert(m1b!.status === "ANSWERED" && m1b!.answer === "The answer is 42", "answer recorded on move", m1b);
  assert(s1!.state === "NUMBER_SELECTION" && s1!.round === 2 && s1!.currentTurnUserId === B.user.id, "turn swapped to B, round 2", { state: s1!.state, round: s1!.round, turn: s1!.currentTurnUserId });

  console.log("== 10. duplicate number rejected ==");
  await handleWhatsAppMessage({ phone: B.user.phone, name: "Bob", text: "2" });
  const moveCount = await prisma.gameMove.count({ where: { sessionId: s1!.id } });
  const sAfterDup = await prisma.session.findUnique({ where: { id: s1!.id } });
  assert(moveCount === 1 && sAfterDup!.state === "NUMBER_SELECTION" && sAfterDup!.round === 2, "duplicate number rejected (no new move, no advance)", { moves: moveCount, state: sAfterDup!.state });

  console.log("== 11. non-turn number pick rejected ==");
  await handleWhatsAppMessage({ ...p1, text: "3" });
  assert((await prisma.gameMove.count({ where: { sessionId: s1!.id } })) === 1, "A cannot pick while B's turn (count unchanged)");

  console.log("== 12. second round proceeds ==");
  await handleWhatsAppMessage({ phone: B.user.phone, name: "Bob", text: "3" });
  await handleWhatsAppMessage({ ...p1, text: "round2 answer" });
  s1 = await prisma.session.findUnique({ where: { id: s1!.id } });
  assert(s1!.round === 3 && s1!.state === "NUMBER_SELECTION" && s1!.currentTurnUserId === A.user.id, "round 3, A's turn", { round: s1!.round, state: s1!.state });

  console.log("== 13. status/manage/help do not crash ==");
  await handleWhatsAppMessage({ ...p1, text: "/status" });
  await handleWhatsAppMessage({ ...p1, buttonId: "manage" });
  await handleWhatsAppMessage({ ...p1, text: "/help" });
  await handleWhatsAppMessage({ ...p1, text: "/boguscommand" });
  await handleWhatsAppMessage({ ...p1, text: "/random" });
  assert(true, "status/manage/help/unknown/random handled without exception");

  console.log("== 14. end session flow ==");
  await handleWhatsAppMessage({ ...p1, buttonId: "end_yes" });
  s1 = await prisma.session.findUnique({ where: { id: s1!.id } });
  assert(s1!.status === "ABANDONED" && s1!.state === "ENDED", "session ended via button", { status: s1!.status, state: s1!.state });
  await handleWhatsAppMessage({ ...p1, buttonId: "truth_tap" });
  assert(true, "stale button after end handled gracefully");
  await handleWhatsAppMessage({ ...p1, text: "/status" });
  assert(true, "/status after end handled (no session)");

  console.log("== 15. TRUTH/DARE flow ==");
  const c1 = await getOrCreateUser("+15550000004", "Dana");
  const d1 = await getOrCreateUser("+15550000005", "Eve");
  await handleWhatsAppMessage({ phone: c1.user.phone, name: "Dana", text: "/start" });
  const sTD = await prisma.session.findFirst({ where: { creatorId: c1.user.id } });
  await join(sTD!.inviteCode, d1.user.phone);
  await handleWhatsAppMessage({ phone: c1.user.phone, name: "Dana", listId: catTD.id });
  await handleWhatsAppMessage({ phone: d1.user.phone, name: "Eve", buttonId: "category_accept" });
  let td = await prisma.session.findUnique({ where: { id: sTD!.id } });
  assert(td!.state === "TRUTH_DARE_SELECTION" && td!.currentTurnUserId === c1.user.id, "TD category → TRUTH_DARE_SELECTION", td!.state);
  await handleWhatsAppMessage({ phone: c1.user.phone, name: "Dana", buttonId: "truth_tap" });
  td = await prisma.session.findUnique({ where: { id: sTD!.id } });
  const tdMove1 = await prisma.gameMove.findFirst({ where: { sessionId: sTD!.id } });
  assert(td!.state === "WAITING_FOR_ANSWER" && tdMove1!.type === "TRUTH" && tdMove1!.status === "PENDING_ANSWER", "truth tapped → move recorded", tdMove1);
  await handleWhatsAppMessage({ phone: d1.user.phone, name: "Eve", text: "truth answer" });
  td = await prisma.session.findUnique({ where: { id: sTD!.id } });
  assert(td!.state === "TRUTH_DARE_SELECTION" && td!.currentTurnUserId === d1.user.id, "turn swapped in TD game", td!.state);
  await handleWhatsAppMessage({ phone: d1.user.phone, name: "Eve", buttonId: "dare_tap" });
  td = await prisma.session.findUnique({ where: { id: sTD!.id } });
  await handleWhatsAppMessage({ phone: c1.user.phone, name: "Dana", text: "dare answer" });
  td = await prisma.session.findUnique({ where: { id: sTD!.id } });
  const tdMoves = await prisma.gameMove.count({ where: { sessionId: sTD!.id } });
  assert(td!.state === "COMPLETED" && td!.status === "COMPLETED" && tdMoves === 2, "TD exhausted → COMPLETED", { state: td!.state, moves: tdMoves });
  assert((await prisma.category.findUnique({ where: { id: catTD.id } }))!.playCount === 1, "category playCount incremented");

  console.log("== 16. invite expiry (ABANDONED/EXPIRED) ==");
  const e1 = await getOrCreateUser("+15550000006", "Fiona");
  const f1 = await getOrCreateUser("+15550000007", "Gus");
  await handleWhatsAppMessage({ phone: e1.user.phone, name: "Fiona", text: "/start" });
  const sE = await prisma.session.findFirst({ where: { creatorId: e1.user.id } });
  await prisma.session.update({ where: { id: sE!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await join(sE!.inviteCode, f1.user.phone);
  const sExp = await prisma.session.findUnique({ where: { id: sE!.id } });
  assert(sExp!.status === "ABANDONED" && sExp!.state === "EXPIRED", "expired invite → EXPIRED", { status: sExp!.status, state: sExp!.state });
  assert((await prisma.session.count({ where: { joinerId: f1.user.id } })) === 0, "joiner of expired invite gets no session");

  console.log("== 17. worker expiry query matches ==");
  const g1 = await getOrCreateUser("+15550000008", "Hana");
  await handleWhatsAppMessage({ phone: g1.user.phone, name: "Hana", text: "/start" });
  const sW = await prisma.session.findFirst({ where: { creatorId: g1.user.id } });
  await prisma.session.update({ where: { id: sW!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await prisma.session.findMany({
    where: { status: "WAITING", state: "WAITING_FOR_OPPONENT", expiresAt: { lt: new Date() } },
    select: { id: true },
  });
  assert(expired.some((e) => e.id === sW!.id), "worker's selection query finds stale waiting session", expired);

  console.log("== 18. idempotency (ProcessedEvent unique) ==");
  await prisma.processedEvent.create({ data: { eventId: "ev-dup-1", phone: "+15550000009" } });
  let dupThrew = false;
  try {
    await prisma.processedEvent.create({ data: { eventId: "ev-dup-1", phone: "+15550000009" } });
  } catch (err) {
    dupThrew = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
  }
  assert(dupThrew, "duplicate ProcessedEvent eventId raises P2002");

  console.log("== 19. concurrent join race (only one wins) ==");
  const h1 = await getOrCreateUser("+15550000010", "Ivy");
  const i1 = await getOrCreateUser("+15550000011", "Jack");
  const j1 = await getOrCreateUser("+15550000012", "Kim");
  await handleWhatsAppMessage({ phone: h1.user.phone, name: "Ivy", text: "/start" });
  const sR = await prisma.session.findFirst({ where: { creatorId: h1.user.id } });
  const claim = async (uid: string): Promise<number> =>
    prisma.$transaction(async (tx) => {
      const res = await tx.session.updateMany({
        where: { id: sR!.id, status: "WAITING", joinerId: null, state: "WAITING_FOR_OPPONENT" },
        data: { joinerId: uid, status: "ACTIVE", state: "CATEGORY_SELECTION", categoryProposerId: h1.user.id, startedAt: new Date(), expiresAt: null, lastActivityAt: new Date() },
      });
      if (res.count === 1) {
        await tx.user.updateMany({ where: { id: { in: [h1.user.id, uid] } }, data: { totalSessions: { increment: 1 } } });
      }
      return res.count;
    });
  const results = await Promise.all([claim(i1.user.id), claim(j1.user.id)]);
  const winners = results.filter((r) => r === 1).length;
  assert(winners === 1, `concurrent join: exactly one winner (got ${winners})`, results);
  const sR2 = await prisma.session.findUnique({ where: { id: sR!.id } });
  assert(sR2!.joinerId === i1.user.id || sR2!.joinerId === j1.user.id, "exactly one joiner persisted", sR2!.joinerId);

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  if (fail > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error("SMOKE ERROR:", err);
    process.exit(2);
  })
  .finally(() => prisma.$disconnect());
