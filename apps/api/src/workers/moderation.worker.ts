import { createWorker } from "../lib/queue";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

export function startModerationWorker(): void {
  createWorker("moderation", async (job) => {
    const { contributionId } = job.data as { contributionId: string };
    const contribution = await prisma.contribution.findUnique({ where: { id: contributionId } });
    if (!contribution) return;
    logger.info("[worker:moderation] processing contribution", { id: contribution.id });
  });
}
