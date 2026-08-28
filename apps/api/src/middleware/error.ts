import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/response";
import { reportError } from "../lib/error-report";
import { getRequestId } from "../lib/context";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { message: "Route not found", status: 404, requestId: getRequestId() },
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const requestId = getRequestId();

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { message: err.message, details: err.details, status: err.statusCode, requestId },
    });
  }

  const e = err as Error;
  if (e.message === "INVALID_FILE_TYPE") {
    return res.status(400).json({
      success: false,
      error: { message: "Invalid file type. Allowed: png, jpeg, webp, gif.", status: 400, requestId },
    });
  }
  if (e.message?.includes("file too large")) {
    return res.status(413).json({
      success: false,
      error: { message: "File too large", status: 413, requestId },
    });
  }
  if (e.message?.includes("Unique constraint")) {
    return res.status(409).json({
      success: false,
      error: { message: "A record with that value already exists.", status: 409, requestId },
    });
  }

  reportError({ component: "api:unhandled", err, severity: "error", alertAdmins: false });

  res.status(500).json({
    success: false,
    error: { message: "Internal server error", status: 500, requestId },
  });
}