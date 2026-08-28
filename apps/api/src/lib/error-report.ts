import { prisma } from "./prisma";
import { logger } from "./logger";
import { getRedis } from "./redis";
import { getRequestId } from "./context";
import { notifyAdmins } from "../services/notifications";

// ============================================================
// Centralized error reporting:
//  - normalizes unknown errors into safe, short messages
//  - attaches the requestId
//  - optionally records a SystemEvent + admin alert, throttled
//    per component so a flapping service doesn't spam the admin
//    notification center or the WhatsApp bot.
// ============================================================

const ALERT_THROTTLE_SECONDS = 120;

export type ReportErrorOptions = {
  component: string;
  err: unknown;
  severity?: "warn" | "error";
  alertAdmins?: boolean;
};

export function sanitizeError(err: unknown): string {
  if (err instanceof Error) return (err.message || "Unknown error").slice(0, 500);
  try {
    return String(err).slice(0, 500);
  } catch {
    return "Unknown error";
  }
}

export function reportError(opts: ReportErrorOptions): void {
  const message = sanitizeError(opts.err);
  const requestId = getRequestId();
  const severity = opts.severity ?? "error";
  logger[severity](`[${opts.component}] ${message}`, { requestId });

  if (opts.alertAdmins) {
    throttleAlert(opts.component, message).catch(() => undefined);
  }
}

async function throttleAlert(component: string, message: string): Promise<void> {
  const key = `alerts:component:${component}`;
  const redis = getRedis();
  if (redis.status === "ready") {
    const acquired = await redis.set(key, "1", "EX", ALERT_THROTTLE_SECONDS, "NX");
    if (acquired !== "OK") return;
  }

  await prisma.systemEvent
    .create({ data: { component, status: "degraded", message: message.slice(0, 500) } })
    .catch(() => undefined);
  await notifyAdmins({
    type: "SYSTEM_ALERT",
    title: `${component} error`,
    message: message.slice(0, 300),
  }).catch(() => undefined);
}