import { NotificationType, type Notification, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { enqueue } from "../lib/queue";

// ============================================================
// Notification service.
//
// Channels:
//   WEB      — in-app notification only (no external send)
//   WHATSAPP — delivered to the player's phone by the worker
//   SYSTEM   — admin notification center alert
//
// Status lifecycle:
//   PENDING -> SENDING -> SENT | FAILED
//   (long-stuck SENDING rows are reconciled by the recovery cron)
// ============================================================

export type NotificationChannel = "WEB" | "WHATSAPP" | "SYSTEM";

export type NotifyInput = {
  adminId?: string;
  userId?: string;
  phone?: string;
  type: NotificationType;
  channel?: NotificationChannel;
  title: string;
  message: string;
  link?: string;
  metadata?: Prisma.InputJsonValue;
};

function defaultChannelFor(input: NotifyInput): NotificationChannel {
  if (input.channel) return input.channel;
  if (input.adminId) return "SYSTEM";
  if (input.userId) return "WHATSAPP";
  return "SYSTEM";
}

export async function createNotification(input: NotifyInput): Promise<Notification> {
  const channel = defaultChannelFor(input);
  const n = await prisma.notification.create({
    data: {
      adminId: input.adminId ?? null,
      userId: input.userId ?? null,
      phone: input.phone ?? null,
      type: input.type,
      channel,
      status: "PENDING",
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      metadata: (input.metadata ?? null) as Prisma.InputJsonValue,
    },
  });
  await enqueue("notification", "deliver", { id: n.id });
  return n;
}

export async function notify(input: NotifyInput): Promise<Notification> {
  return createNotification(input);
}

export async function notifyUser(
  userId: string,
  input: Omit<NotifyInput, "userId"> & { channel?: "WEB" | "WHATSAPP" }
): Promise<Notification> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, phone: true } });
  return createNotification({
    ...input,
    userId,
    phone: input.phone ?? user?.phone,
    channel: input.channel ?? "WEB",
  });
}

export async function notifyAdmins(input: Omit<NotifyInput, "adminId">): Promise<Notification[]> {
  const admins = await prisma.admin.findMany({ where: { active: true }, select: { id: true } });
  const created: Notification[] = [];
  for (const a of admins) {
    created.push(await createNotification({ ...input, adminId: a.id, channel: "SYSTEM" }));
  }
  return created;
}