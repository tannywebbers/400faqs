import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { sendText, sendButtons, sendList } from "../lib/whatsapp";
import { logger } from "../lib/logger";

type MessageResult = { ok: boolean; messageId?: string; error?: string };

export async function sendTextMessage(
  phone: string,
  body: string,
  opts?: { userId?: string; templateId?: string; previewUrl?: boolean }
): Promise<MessageResult> {
  const result = await sendText(phone, body, opts?.previewUrl);
  await logMessage({
    direction: "outbound",
    phone,
    type: "text",
    status: result.ok ? "sent" : "failed",
    content: { body },
    templateId: opts?.templateId,
    userId: opts?.userId,
    error: result.error,
  });
  return { ok: result.ok, error: result.error };
}

export async function sendButtonMessage(
  phone: string,
  body: string,
  buttons: { id: string; title: string }[],
  opts?: { userId?: string; templateId?: string; header?: string; footer?: string }
): Promise<MessageResult> {
  const result = await sendButtons(phone, body, buttons, { header: opts?.header, footer: opts?.footer });
  await logMessage({
    direction: "outbound",
    phone,
    type: "interactive_button",
    status: result.ok ? "sent" : "failed",
    content: { body, buttons, header: opts?.header, footer: opts?.footer },
    templateId: opts?.templateId,
    userId: opts?.userId,
    error: result.error,
  });
  return { ok: result.ok, error: result.error };
}

export async function sendListMessage(
  phone: string,
  body: string,
  buttonText: string,
  rows: { id: string; title: string; description?: string }[],
  opts?: { userId?: string; templateId?: string; header?: string; footer?: string }
): Promise<MessageResult> {
  const result = await sendList(phone, body, buttonText, rows, { header: opts?.header, footer: opts?.footer });
  await logMessage({
    direction: "outbound",
    phone,
    type: "interactive_list",
    status: result.ok ? "sent" : "failed",
    content: { body, buttonText, rows, header: opts?.header, footer: opts?.footer },
    templateId: opts?.templateId,
    userId: opts?.userId,
    error: result.error,
  });
  return { ok: result.ok, error: result.error };
}

export async function logMessage(entry: {
  direction: "inbound" | "outbound";
  phone: string;
  type: string;
  status: string;
  content: Record<string, unknown>;
  userId?: string;
  templateId?: string;
  waMessageId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.messageLog.create({
      data: {
        direction: entry.direction,
        phone: entry.phone,
        userId: entry.userId ?? null,
        type: entry.type,
        status: entry.status,
        content: entry.content as Prisma.InputJsonValue,
        templateId: entry.templateId ?? null,
        waMessageId: entry.waMessageId ?? null,
        error: entry.error ?? null,
        metadata: (entry.metadata ?? null) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error("[messaging] failed to log message", (err as Error).message);
  }
}

export async function getMessageLogs(opts: {
  page?: number;
  limit?: number;
  direction?: string;
  phone?: string;
  status?: string;
} = {}): Promise<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(opts.page ?? 1, 1);
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  const where: Record<string, unknown> = {};
  if (opts.direction) where.direction = opts.direction;
  if (opts.phone) where.phone = { contains: opts.phone };
  if (opts.status) where.status = opts.status;

  const [total, items] = await Promise.all([
    prisma.messageLog.count({ where }),
    prisma.messageLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}
