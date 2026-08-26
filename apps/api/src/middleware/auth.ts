import type { Request, Response, NextFunction } from "express";
import { verifyAdminToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/response";

export type AdminRequest = Request & {
  admin: { id: string; email: string; role: string };
};

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Authentication required"));
  }
  const token = header.slice(7);
  const payload = verifyAdminToken(token);
  if (!payload) {
    return next(new AppError(401, "Invalid or expired token"));
  }
  const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
  if (!admin || !admin.active) {
    return next(new AppError(401, "Account disabled"));
  }
  (req as AdminRequest).admin = { id: admin.id, email: admin.email, role: admin.role };
  next();
}

export function requireRole(roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const admin = (req as AdminRequest).admin;
    if (!admin || !roles.includes(admin.role)) {
      return next(new AppError(403, "Insufficient permissions"));
    }
    next();
  };
}
