import { Router, type Request } from "express";
import { verifyWebhook, verifyWebhookSignature, isRetryableWebhookError } from "../lib/whatsapp";
import { handleWhatsAppMessage } from "../services/game";
import { logMessage } from "../services/messaging";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { notifyAdmins } from "../services/notifications";
import { reportError } from "../lib/error-report";
import { emitAdminEvent } from "../sockets";
import { webhookLimiter } from "../middleware/rateLimit";

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

async function handleDeliveryStatus(status: { id?: string; status?: string }): Promise<void> {
  if (!status.id || !status.status) return;

  await prisma.messageLog
    .updateMany({ where: { waMessageId: status.id }, data: { status: status.status } })
    .catch(() => undefined);

  emitAdminEvent("whatsapp:status", { id: status.id, status: status.status });
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

// Incoming messages (POST) — rate limited but generous so Meta retries pass.
webhookRouter.post("/whatsapp", webhookLimiter, async (req, res) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!verifyWebhookSignature(rawBody, req.headers["x-hub-signature-256"] as string | undefined)) {
    res.status(401).json({ success: false, error: { message: "Invalid signature" } });
    return;
  }

  res.status(200).json({ received: true });

  const body = req.body as { entry?: WaEntry[] };
  try {
    const entries = body.entry ?? [];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        if (value.statuses) {
          // Per-status isolation: never let one bad status abort the batch.
          for (const status of value.statuses) {
            try {
              await handleDeliveryStatus(status);
            } catch (err) {
              logger.warn("[whatsapp] status update failed", (err as Error).message);
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
            // Only ask WhatsApp to re-deliver when the failure is transient
            // (DB/network). Permanent per-message errors must not requeue forever.
            if (isRetryableWebhookError(err)) {
              await clearProcessed(id);
              throw err;
            }
            logger.error("[whatsapp] message processing failed (permanent)", { id, error: (err as Error).message });
          }
        }
      }
    }
  } catch (err) {
    logger.error("[whatsapp] webhook processing failed", (err as Error).message);
    await prisma.systemEvent
      .create({ data: { component: "whatsapp", status: "degraded", message: "Webhook processing error" } })
      .catch(() => undefined);
    void notifyAdmins({
      type: "SYSTEM_ALERT",
      title: "WhatsApp webhook error",
      message: (err as Error).message.slice(0, 200),
    }).catch(() => undefined);
    reportError({ component: "whatsapp:webhook", err, severity: "error", alertAdmins: false });
  }
});