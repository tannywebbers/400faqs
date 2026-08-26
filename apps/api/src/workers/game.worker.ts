import { createWorker } from "../lib/queue";
import { prisma } from "../lib/prisma";
import { sendText } from "../lib/whatsapp";
import { messages } from "../services/messages";
import { logger } from "../lib/logger";

async function settingValue(key: string, fallback: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

async function numberSetting(key: string, fallback: number): Promise<number> {
  const v = await settingValue(key, String(fallback));
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function startGameWorker(): void {
  createWorker("game", async (job) => {
    const { sessionId } = job.data as { sessionId: string };
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { creator: true, joiner: true },
    });
    if (!session) return;

    if (session.status === "WAITING") {
      // Invite expiration (WAITING_FOR_OPPONENT)
      const expiryMinutes = await numberSetting("game.inviteExpiryMinutes", 60);
      const expiry = session.expiresAt ?? new Date(session.createdAt.getTime() + expiryMinutes * 60 * 1000);
      if (expiry < new Date()) {
        await prisma.session.update({
          where: { id: session.id },
          data: { status: "ABANDONED", state: "EXPIRED", finishedAt: new Date() },
        });
        await sendText(session.creator.phone, messages.inviteExpired(session.inviteCode));
        logger.info("[worker:game] invite expired", { sessionId: session.id });
      }
      return;
    }

    if (session.status === "ACTIVE") {
      // Inactivity / turn timeout
      const timeoutMinutes = await numberSetting("game.turnTimeoutMinutes", 5);
      const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
      if (session.lastActivityAt < cutoff) {
        await prisma.session.update({
          where: { id: session.id },
          data: { status: "ABANDONED", state: "ENDED", finishedAt: new Date() },
        });
        const phones = [session.creator.phone, session.joiner?.phone].filter(Boolean) as string[];
        for (const p of phones) {
          await sendText(p, messages.timedOut(timeoutMinutes));
        }
        logger.info("[worker:game] session timed out", { sessionId: session.id });
      }
    }
  });
}
