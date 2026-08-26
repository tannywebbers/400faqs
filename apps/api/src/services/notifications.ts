import { NotificationType, type Notification } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { enqueue } from "../lib/queue";

type NotifyInput = {
  adminId?: string;
  userId?: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
};

export async function notify(input: NotifyInput): Promise<Notification> {
  const n = await prisma.notification.create({ data: input });
  await enqueue("notification", "deliver", { id: n.id });
  return n;
}

export async function notifyAdmins(input: Omit<NotifyInput, "adminId">): Promise<Notification[]> {
  const admins = await prisma.admin.findMany({ where: { active: true }, select: { id: true } });
  const created: Notification[] = [];
  for (const a of admins) {
    created.push(await notify({ ...input, adminId: a.id }));
  }
  return created;
}
