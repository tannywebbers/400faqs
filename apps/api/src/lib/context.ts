import { AsyncLocalStorage } from "async_hooks";
import crypto from "crypto";
import type { Request } from "express";

// ============================================================
// Per-request context. The requestId is generated once per HTTP
// request, returned to clients (X-Request-Id) and threaded through
// every log line and admin alert so failures can be traced.
// ============================================================

export type RequestContext = {
  requestId: string;
  ip?: string;
  method?: string;
  path?: string;
  startedAt: number;
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function getRequestId(): string {
  return requestContext.getStore()?.requestId ?? "cli";
}

export function getRequestIp(): string | undefined {
  return requestContext.getStore()?.ip;
}

export function requestIp(req: Request): string | undefined {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress;
}