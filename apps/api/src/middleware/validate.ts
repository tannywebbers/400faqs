import type { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../lib/response";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
      return next(new AppError(400, "Validation failed", issues));
    }
    (req as Request & { validated: Record<string, unknown> }).validated = result.data as Record<string, unknown>;
    next();
  };
}

export function parsePagination(query: Record<string, unknown>, defaults: { maxLimit?: number } = {}) {
  const max = defaults.maxLimit ?? 100;
  const rawPage = Number(query.page ?? 1);
  const rawLimit = Number(query.limit ?? 20);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), max) : 20;
  return { page, limit, skip: (page - 1) * limit };
}
