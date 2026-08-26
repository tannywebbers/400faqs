import { createWorker } from "../lib/queue";
import { prisma } from "../lib/prisma";
import { sendText } from "../lib/whatsapp";
import { logger } from "../lib/logger";

export function startNotificationWorker(): void {
  createWorker("notification", async (job) => {
    const { id } = job.data as { id: string };
    const notification = await prisma.notification.findUnique({
      where: { id },
      include: { admin: true, user: true },
    });
    if (!notification) return;

    const phone = notification.user?.phone;
    if (phone) {
      await sendText(phone, `🔔 *${notification.title}*\n\n${notification.message}`);
      return;
    }
    logger.info("[worker:notification] delivered", { id, type: notification.type });
  });
}
