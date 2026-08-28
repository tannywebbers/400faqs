import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { logger } from "./logger";

type WhatsAppText = {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string; preview_url?: boolean };
};

type WhatsAppInteractive = {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: {
    type: "button" | "list";
    header?: { type: "text"; text: string };
    body: { text: string };
    footer?: { text: string };
    action: Record<string, unknown>;
  };
};

function waEnabled(): boolean {
  return Boolean(config.whatsapp.token && config.whatsapp.phoneNumberId);
}

async function send(payload: WhatsAppText | WhatsAppInteractive): Promise<{ ok: boolean; error?: string }> {
  if (!waEnabled()) {
    logger.warn("[whatsapp] not configured, message not sent", { to: payload.to });
    return { ok: false, error: "WHATSAPP_NOT_CONFIGURED" };
  }
  try {
    const url = `${config.whatsapp.apiBase}/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error("[whatsapp] send failed", { status: res.status, body });
      return { ok: false, error: body.slice(0, 500) };
    }
    return { ok: true };
  } catch (err) {
    logger.error("[whatsapp] send error", (err as Error).message);
    return { ok: false, error: (err as Error).message };
  }
}

export async function sendText(to: string, body: string, previewUrl = false): Promise<{ ok: boolean; error?: string }> {
  return send({ messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: previewUrl } });
}

export async function sendButtons(
  to: string,
  body: string,
  buttons: { id: string; title: string }[],
  opts?: { header?: string; footer?: string }
): Promise<{ ok: boolean; error?: string }> {
  return send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      ...(opts?.header ? { header: { type: "text", text: opts.header.slice(0, 60) } } : {}),
      body: { text: body.slice(0, 1024) },
      ...(opts?.footer ? { footer: { text: opts.footer.slice(0, 60) } } : {}),
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })),
      },
    },
  });
}

export async function sendList(
  to: string,
  body: string,
  buttonText: string,
  rows: { id: string; title: string; description?: string }[],
  opts?: { header?: string; footer?: string }
): Promise<{ ok: boolean; error?: string }> {
  const sections = [];
  for (let i = 0; i < Math.ceil(rows.length / 10); i++) {
    sections.push({ title: "Options", rows: rows.slice(i * 10, i * 10 + 10).map((r) => ({ id: r.id, title: r.title.slice(0, 24), description: (r.description ?? "").slice(0, 72) })) });
  }
  return send({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      ...(opts?.header ? { header: { type: "text", text: opts.header.slice(0, 60) } } : {}),
      body: { text: body.slice(0, 1024) },
      ...(opts?.footer ? { footer: { text: opts.footer.slice(0, 60) } } : {}),
      action: { button: buttonText.slice(0, 20), sections },
    },
  });
}

/** Returns the challenge value for webhook verification. */
export function verifyWebhook(query: Record<string, unknown>): { ok: boolean; challenge?: string } {
  const mode = query["hub.mode"];
  const token = query["hub.verify_token"];
  const challenge = query["hub.challenge"];
  if (mode === "subscribe" && token === config.whatsapp.verifyToken && typeof challenge === "string") {
    return { ok: true, challenge };
  }
  return { ok: false };
}

export function waPhoneNumberId(): string {
  return config.whatsapp.phoneNumberId;
}

export function whatsappConfigured(): boolean {
  return waEnabled();
}

/**
 * Verifies the X-Hub-Signature-256 header sent by Meta against the raw
 * request body using WHATSAPP_APP_SECRET. When the secret is not configured
 * the check is skipped (verified at boot by requireEnv warnings).
 */
export function verifyWebhookSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
  if (!config.whatsapp.appSecret) return true;
  const provided = signatureHeader ?? "";
  const prefix = "sha256=";
  if (!provided.startsWith(prefix)) return false;

  const expected = createHmac("sha256", config.whatsapp.appSecret)
    .update(rawBody ?? Buffer.alloc(0))
    .digest("hex");
  const a = Buffer.from(provided.slice(prefix.length));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Transient failures that warrant asking WhatsApp to retry the delivery. */
export function isRetryableWebhookError(err: unknown): boolean {
  const e = err as { code?: string; name?: string };
  if (typeof e.code === "string" && /^P/.test(e.code)) return true;
  const name = e.name ?? "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const message = (err as Error)?.message ?? "";
  return /fetch|connect|timeout|ECONN|socket/i.test(message);
}
