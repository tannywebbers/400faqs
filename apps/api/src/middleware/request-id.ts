import type { Request, Response, NextFunction } from "express";
import { requestContext, createRequestId, requestIp } from "../lib/context";

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.trim()
      ? createIncomingId(incoming)
      : createRequestId();

  res.setHeader("X-Request-Id", requestId);

  const store = {
    requestId,
    ip: requestIp(req),
    method: req.method,
    path: req.path,
    startedAt: Date.now(),
  };

  requestContext.run(store, next);
}

function createIncomingId(raw: string): string {
  const value = raw.replace(/[^A-Za-z0-9._~-]/g, "").slice(0, 64);
  return value || createRequestId();
}