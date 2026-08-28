import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// ============================================================
// Audit helper — every admin mutation should go through this so
// the Activity Log stays complete. Audit failures never break the
// originating request.
// ============================================================

export type AuditEntry = {
  adminId: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ip?: string;
};

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const details = (entry.details ?? null) as Prisma.InputJsonValue;
    await prisma.auditLog.create({
      data: {
        adminId: entry.adminId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        details,
        ip: entry.ip ?? null,
      },
    });
  } catch {
    /* never break the request because auditing failed */
  }
}