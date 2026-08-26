import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { AppError } from "../lib/response";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: { message: "Route not found" } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, details: err.details },
    });
  }

  const e = err as Error;
  if (e.message === "INVALID_FILE_TYPE") {
    return res.status(400).json({ success: false, error: { message: "Invalid file type. Allowed: png, jpeg, webp, gif." } });
  }
  if (e.message?.includes("file too large")) {
    return res.status(413).json({ success: false, error: { message: "File too large" } });
  }
  if (e.message?.includes("Unique constraint")) {
    return res.status(409).json({ success: false, error: { message: "A record with that value already exists." } });
  }

  logger.error("[api] unhandled error", { message: e?.message, stack: e?.stack });
  res.status(500).json({ success: false, error: { message: "Internal server error" } });
}
