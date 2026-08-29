import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { getWhatsAppConfig } from "./whatsapp-config";

// ============================================================
// WhatsApp template library.
//
// Meta (WhatsApp Business Platform) is the source of truth for
// templates. Templates are never authored or edited here — the
// platform only lists the locally-cached library and syncs it
// from the Meta Graph API (`{businessAccountId}/message_templates`).
// ============================================================

export async function listTemplates(opts: {
  page?: number;
  limit?: number;
  status?: string;
  q?: string;
  category?: string;
} = {}): Promise<{ items: unknown[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = Math.max(opts.page ?? 1, 1);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.category) where.category = opts.category;
  if (opts.q) {
    where.OR = [{ name: { contains: opts.q, mode: "insensitive" } }, { body: { contains: opts.q, mode: "insensitive" as const } }];
  }

  const [total, items] = await Promise.all([
    prisma.messageTemplate.count({ where }),
    prisma.messageTemplate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getTemplateStats() {
  const [total, draft, active, approved, rejected, synced] = await Promise.all([
    prisma.messageTemplate.count(),
    prisma.messageTemplate.count({ where: { status: "DRAFT" } }),
    prisma.messageTemplate.count({ where: { status: "ACTIVE" } }),
    prisma.messageTemplate.count({ where: { status: "APPROVED" } }),
    prisma.messageTemplate.count({ where: { status: "REJECTED" } }),
    prisma.messageTemplate.count({ where: { waTemplateId: { not: null } } }),
  ]);
  return {
    total,
    draft,
    active,
    submitted: approved,
    approved,
    rejected,
    archived: total - draft - active - approved - rejected,
    synced,
  };
}

export type TemplateSyncResult = {
  synced: boolean;
  remote: boolean;
  count: number;
  created: number;
  updated: number;
  warning: string | null;
};

function normalizeMetaStatus(status: string | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    case "PAUSED":
      return "ACTIVE";
    case "PENDING":
      return "SUBMITTED";
    case "IN_APPEAL":
      return "SUBMITTED";
    case "DISABLED":
      return "ARCHIVED";
    default:
      return "SUBMITTED";
  }
}

/**
 * Pull the template library from the Meta WhatsApp Business API and
 * upsert it into the local cache. Idempotent: templates are matched on
 * their Meta template ID (`waTemplateId`).
 */
export async function syncTemplatesFromMeta(): Promise<TemplateSyncResult> {
  const cfg = await getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.businessAccountId) {
    return {
      synced: false,
      remote: false,
      count: 0,
      created: 0,
      updated: 0,
      warning: "WhatsApp API is not configured — set an access token + business account ID to sync templates from Meta.",
    };
  }

  try {
    const url = `${cfg.apiBase}/${cfg.graphVersion}/${cfg.businessAccountId}/message_templates`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn("[template] Meta sync failed", { status: res.status, detail: body.slice(0, 300) });
      return {
        synced: false,
        remote: true,
        count: 0,
        created: 0,
        updated: 0,
        warning: `Meta API rejected the sync request (${res.status}).`,
      };
    }

    const data = (await res.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        status?: string;
        category?: string;
        language?: string;
        components?: Array<{ type?: string; text?: string; format?: string; buttons?: unknown }>;
        rejected_reason?: string;
      }>;
    };
    const templates = data.data ?? [];

    let created = 0;
    let updated = 0;
    for (const t of templates) {
      if (!t.id) continue;
      const header = t.components?.find((c) => c.type === "HEADER")?.text ?? null;
      const body = t.components?.find((c) => c.type === "BODY")?.text ?? "";
      const footer = t.components?.find((c) => c.type === "FOOTER")?.text ?? null;
      const buttonsComp = t.components?.find((c) => c.type === "BUTTONS");
      const buttons = Array.isArray(buttonsComp?.buttons) ? (buttonsComp.buttons as Prisma.InputJsonValue) : [];

      const status = normalizeMetaStatus(t.status);
      const existing = await prisma.messageTemplate.findFirst({ where: { waTemplateId: t.id } });

      if (existing) {
        await prisma.messageTemplate.update({
          where: { id: existing.id },
          data: {
            name: t.name ?? existing.name,
            category: (t.category ?? existing.category).toUpperCase(),
            language: t.language ?? existing.language,
            header,
            body,
            footer,
            buttons,
            status,
            waTemplateId: t.id,
            metaTemplateName: t.name ?? null,
            metaStatus: (t.status ?? "UNKNOWN").toUpperCase(),
            metaRejectionReason: t.rejected_reason ?? null,
            submittedAt: existing.submittedAt ?? new Date(),
            metaUpdatedAt: new Date(),
          },
        });
        updated += 1;
      } else {
        await prisma.messageTemplate.create({
          data: {
            name: t.name ?? `template_${t.id}`,
            category: (t.category ?? "UTILITY").toUpperCase(),
            language: t.language ?? "en",
            header,
            body,
            footer,
            buttons,
            status,
            waTemplateId: t.id,
            metaTemplateName: t.name ?? null,
            metaStatus: (t.status ?? "UNKNOWN").toUpperCase(),
            metaRejectionReason: t.rejected_reason ?? null,
            submittedAt: new Date(),
            metaUpdatedAt: new Date(),
          },
        });
        created += 1;
      }
    }

    logger.info("[template] Meta sync complete", { count: templates.length, created, updated });
    return { synced: true, remote: true, count: templates.length, created, updated, warning: null };
  } catch (err) {
    logger.warn("[template] Meta sync error", (err as Error).message);
    return { synced: false, remote: true, count: 0, created: 0, updated: 0, warning: "Could not reach the Meta API — check the connection and try again." };
  }
}