import { Router } from "express";
import { verifyWebhook } from "../lib/whatsapp";
import { handleWhatsAppMessage } from "../services/game";
import { logMessage } from "../services/messaging";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { notifyAdmins } from "../services/notifications";
import { emitAdminEvent } from "../sockets";

export const webhookRouter = Router();

type WaMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  [key: string]: unknown;
};

type WaValue = {
  messages?: WaMessage[];
  contacts?: Array<{ profile?: { name?: string } }>;
  statuses?: Array<{ id?: string; status?: string }>;
};

type WaChange = { value?: WaValue };

type WaEntry = { id?: string; changes?: WaChange[] };

// Idempotency: a processed WhatsApp message/event ID must never be handled twice.
async function tryMarkProcessed(eventId: string, phone?: string): Promise<boolean> {
  try {
    await prisma.processedEvent.create({ data: { eventId, kind: "message", phone } });
    return true;
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") return false;
    throw err;
  }
}

async function clearProcessed(eventId: string): Promise<void> {
  await prisma.processedEvent.deleteMany({ where: { eventId } }).catch(() => undefined);
}

// Campaign delivery tracking: reflect tombstone statuses from the webhook
// onto CampaignDelivery rows and the parent campaign counters.
async function syncDeliveryFromStatus(deliveryId: string, status: string): Promise<void> {
  const patch: Record<string, unknown> = { status };
  const now = new Date();
  if (status === "delivered") patch.deliveredAt = now;
  else if (status === "read") patch.readAt = now;

  await prisma.campaignDelivery.update({ where: { id: deliveryId }, data: patch }).catch(() => undefined);

  const campaignId = (await prisma.campaignDelivery.findUnique({ where: { id: deliveryId }, select: { campaignId: true } }))?.campaignId;
  if (!campaignId) return;

  const num: Record<string, number> = {};
  if (status === "delivered") num.deliveredCount = 1;
  else if (status === "read") num.readCount = 1;
  if (Object.keys(num).length > 0) {
    await prisma.campaign.update({ where: { id: campaignId }, data: num }).catch(() => undefined);
  }
}

// Verification (GET) - WhatsApp requires this on the same URL
webhookRouter.get("/whatsapp", (req, res) => {
  const result = verifyWebhook(req.query as Record<string, unknown>);
  if (result.ok) {
    res.status(200).send(result.challenge);
  } else {
    res.status(403).send("Verification failed");
  }
});

// Incoming messages (POST)
webhookRouter.post("/whatsapp", async (req, res) => {
  res.status(200).json({ received: true });

  const body = req.body as { entry?: WaEntry[] };
  try {
    const entries = body.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        if (value.statuses) {
          logger.debug("[whatsapp] delivery status", value.statuses.map((s) => ({ id: s.id, status: s.status })));
          for (const status of value.statuses) {
            if (status.id && status.status) {
              const updated = await prisma.messageLog
                .updateMany({ where: { waMessageId: status.id }, data: { status: status.status } })
                .catch(() => undefined);
              if (updated && updated.count > 0) {
                const log = await prisma.messageLog.findFirst({
                  where: { waMessageId: status.id },
                  select: { campaignDeliveryId: true },
                });
                if (log?.campaignDeliveryId) {
                  await syncDeliveryFromStatus(log.campaignDeliveryId, status.status);
                }
              }
            }
          }
        }

        const messages = value.messages ?? [];
        for (const message of messages) {
          const from = message.from;
          const id = message.id;
          if (!from || !id) continue;

          const contactName = value.contacts?.[0]?.profile?.name ?? undefined;
          const text = message.text?.body;

          const interactive = message.interactive;
          const buttonId = interactive?.type === "button_reply" ? interactive.button_reply?.id : undefined;
          const listId = interactive?.type === "list_reply" ? interactive.list_reply?.id : undefined;

          if (!text && !buttonId && !listId) continue;

          // Duplicate webhook guard.
          const fresh = await tryMarkProcessed(id, from);
          if (!fresh) {
            logger.debug("[whatsapp] duplicate message skipped", { id });
            continue;
          }

          try {
            logger.info("[whatsapp] incoming", { from, type: message.type, text: (text ?? buttonId ?? listId ?? "").slice(0, 80) });

            const content: Record<string, unknown> = { type: message.type };
            if (text) content.text = text;
            if (buttonId) content.buttonId = buttonId;
            if (listId) content.listId = listId;
            if (contactName) content.contactName = contactName;

            await logMessage({
              direction: "inbound",
              phone: from,
              type: message.type ?? "unknown",
              status: "received",
              content,
              waMessageId: id,
              metadata: { timestamp: message.timestamp },
            });

            await handleWhatsAppMessage({ phone: from, name: contactName, text, buttonId, listId, timestamp: message.timestamp });
            emitAdminEvent("whatsapp:message", { from, text: (text ?? buttonId ?? listId ?? "").slice(0, 100) });
          } catch (err) {
            // Allow WhatsApp retries to reprocess this message.
            await clearProcessed(id);
            throw err;
          }
        }
      }
    }
  } catch (err) {
    logger.error("[whatsapp] webhook processing failed", (err as Error).message);
    await prisma.systemEvent.create({
      data: { component: "whatsapp", status: "degraded", message: "Webhook processing error" },
    }).catch(() => undefined);
    await notifyAdmins({
      type: "SYSTEM",
      title: "WhatsApp webhook error",
      message: (err as Error).message.slice(0, 200),
    }).catch(() => undefined);
  }
});
