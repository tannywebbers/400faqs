import { createWorker, enqueue } from "../lib/queue";
import { prisma } from "../lib/prisma";
import { sendTextMessage } from "../services/messaging";
import { logger } from "../lib/logger";

const BROADCAST_BATCH = 50;
const BROADCAST_RESCHEDULE_MS = 8_000;

async function claim(id: string): Promise<boolean> {
  const res = await prisma.notification.updateMany({
    where: { id, status: { in: ["PENDING", "SENDING"] } },
    data: { status: "SENDING" },
  });
  return res.count === 1;
}

async function settle(id: string, status: "SENT" | "FAILED"): Promise<void> {
  await prisma.notification.updateMany({
    where: { id, status: "SENDING" },
    data: { status },
  });
}

export async function deliverOne(notificationId: string): Promise<void> {
  const n = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, channel: true, phone: true, title: true, message: true, userId: true, status: true },
  });
  if (!n) return;

  // WEB / SYSTEM notifications have no external send step.
  if (n.channel !== "WHATSAPP") {
    await prisma.notification.updateMany({
      where: { id: n.id, status: { in: ["PENDING", "SENDING"] } },
      data: { status: "SENT" },
    });
    return;
  }

  if (n.status === "SENT" || n.status === "FAILED") return;
  if (!(await claim(n.id))) return;
  if (!n.phone) {
    await settle(n.id, "SENT");
    return;
  }

  const result = await sendTextMessage(n.phone, `🔔 *${n.title}*\n\n${n.message}`, { userId: n.userId ?? undefined });
  if (result.ok) {
    await settle(n.id, "SENT");
  } else if (result.error === "WHATSAPP_NOT_CONFIGURED" || result.error === "INVALID_RECIPIENT") {
    await settle(n.id, "FAILED");
  } else {
    // Transient failure — leave SENDING so the BullMQ retry re-attempts
    // this exact notification; the recovery cron reconciles long-stuck rows.
    throw new Error(result.error ?? "send failed");
  }
}

async function runBroadcastBatch(): Promise<void> {
  const batch = await prisma.notification.findMany({
    where: { channel: "WHATSAPP", status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: BROADCAST_BATCH,
    select: { id: true },
  });

  for (const { id } of batch) {
    try {
      await deliverOne(id);
    } catch (err) {
      logger.warn("[worker:notification] broadcast item failed", { id, error: (err as Error).message });
    }
  }

  const remaining = await prisma.notification.count({
    where: { channel: "WHATSAPP", status: { in: ["PENDING", "SENDING"] } },
  });
  if (remaining > 0 && batch.length > 0) {
    await enqueue("notification", "broadcast", {}, {
      attempts: 1,
      delay: BROADCAST_RESCHEDULE_MS,
      jobId: "broadcast-chain",
    });
  }
}

export function startNotificationWorker(): void {
  createWorker("notification", async (job) => {
    if (job.name === "broadcast") {
      await runBroadcastBatch();
      return;
    }

    const { id } = job.data as { id: string };
    await deliverOne(id);
  });
}