import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { getWhatsAppConfig } from "./whatsapp-config";

// ============================================================
// WhatsApp template management.
//
// Owns: local template library, validation, the Meta approval
// workflow (submit / approve / reject) and usage tracking.
//
// The Meta submission step is best-effort: when a WhatsApp
// Business token + business account ID are configured we attempt
// the real Graph API call; otherwise the template is recorded as
// locally submitted and the admin can complete the flow from the
// Meta dashboard.
// ============================================================

const TEMPLATE_CATEGORIES = ["UTILITY", "MARKETING", "AUTHENTICATION"];
const VALID_NAME = /^[a-z0-9_]{1,100}$/;

export type TemplateValidation = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  variables: string[];
};

function extractVariables(...parts: (string | null | undefined)[]): string[] {
  const found = new Set<number>();
  const re = /\{\{(\d+)\}\}/g;
  for (const p of parts) {
    if (!p) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p)) !== null) {
      found.add(Number(m[1]));
    }
  }
  return [...found].sort((a, b) => a - b).map((n) => `{{${n}}}`);
}

export async function validateTemplate(input: {
  name?: string;
  category?: string;
  language?: string;
  header?: string | null;
  body?: string;
  footer?: string | null;
  buttons?: unknown;
}): Promise<TemplateValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = (input.name ?? "").trim();
  if (!name) errors.push("Name is required.");
  else if (name.length > 100) errors.push("Name must be 100 characters or less.");
  else if (!VALID_NAME.test(name)) errors.push("Name must be lowercase snake_case (letters, numbers, underscores).");

  const category = input.category ?? "UTILITY";
  if (!TEMPLATE_CATEGORIES.includes(category)) {
    errors.push(`Category must be one of: ${TEMPLATE_CATEGORIES.join(", ")}.`);
  }

  const header = input.header?.trim() || null;
  const body = (input.body ?? "").trim();
  const footer = input.footer?.trim() || null;

  if (header && header.length > 60) errors.push("Header must be 60 characters or less.");
  if (!body) errors.push("Body is required.");
  else if (body.length > 1024) errors.push("Body must be 1024 characters or less.");
  if (footer && footer.length > 60) errors.push("Footer must be 60 characters or less.");
  if (footer && /\{\{/.test(footer)) errors.push("Footer cannot contain variables.");

  const buttons = Array.isArray(input.buttons) ? input.buttons : [];
  if (buttons.length > 3) errors.push("A template supports at most 3 buttons.");
  for (const b of buttons as { title?: unknown }[]) {
    const title = (b.title ?? "").toString();
    if (title.length > 20) errors.push(`Button title "${title}" exceeds 20 characters.`);
  }

  const variables = extractVariables(header, body);
  // Variables must start at {{1}} and be contiguous.
  for (let i = 0; i < variables.length; i++) {
    if (variables[i] !== `{{${i + 1}}}`) {
      errors.push(`Variables must start at {{1}} and be contiguous. Found ${variables[i]} before {{${i + 1}}}.`);
      break;
    }
  }
  if (variables.length > 0 && header && /^\d+$/.test(header)) {
    warnings.push("Numeric-only headers may be interpreted as media headers; use plain text.");
  }

  return { ok: errors.length === 0, errors, warnings, variables };
}

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
      include: { _count: { select: { campaigns: true } } },
    }),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getTemplateStats() {
  const [total, draft, active, submitted, approved, rejected, archived, totalUsage] = await Promise.all([
    prisma.messageTemplate.count(),
    prisma.messageTemplate.count({ where: { status: "DRAFT" } }),
    prisma.messageTemplate.count({ where: { status: "ACTIVE" } }),
    prisma.messageTemplate.count({ where: { status: "SUBMITTED" } }),
    prisma.messageTemplate.count({ where: { status: "APPROVED" } }),
    prisma.messageTemplate.count({ where: { status: "REJECTED" } }),
    prisma.messageTemplate.count({ where: { status: "ARCHIVED" } }),
    prisma.messageTemplate.aggregate({ _sum: { usageCount: true } }),
  ]);
  return {
    total,
    draft,
    active,
    submitted,
    approved,
    rejected,
    archived,
    totalUsage: totalUsage._sum.usageCount ?? 0,
  };
}

/** Build the Meta template payload (local preview of what gets submitted to Graph). */
function buildMetaPayload(template: {
  name: string;
  category: string;
  language: string;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: unknown;
}) {
  const components: Record<string, unknown>[] = [];
  if (template.header) components.push({ type: "HEADER", format: "TEXT", text: template.header });
  components.push({ type: "BODY", text: template.body });
  if (template.footer) components.push({ type: "FOOTER", text: template.footer });

  const buttons = Array.isArray(template.buttons) ? template.buttons : [];
  if (buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons.slice(0, 3).map((b: { id?: unknown; title?: unknown }) => ({
        type: "QUICK_REPLY",
        text: (b.title ?? "").toString().slice(0, 20),
      })),
    });
  }

  return {
    name: template.name,
    language: template.language,
    category: template.category,
    components,
  };
}

/**
 * Best-effort submission to the Meta WhatsApp Business API.
 * Returns the Graph result when reachable, otherwise a local-only
 * submission record (no credentials configured / API failure).
 */
export async function submitTemplateToMeta(
  template: { id: string; name: string; category: string; language: string; header: string | null; body: string; footer: string | null; buttons: unknown; waTemplateId: string | null }
): Promise<{ submitted: boolean; remote: boolean; remoteId: string | null; warning: string | null }> {
  const cfg = await getWhatsAppConfig();
  const payload = buildMetaPayload(template);

  if (cfg.accessToken && cfg.businessAccountId) {
    try {
      const url = `${cfg.apiBase}/${cfg.graphVersion}/${cfg.businessAccountId}/message_templates`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string; name?: string; status?: string };
        await prisma.messageTemplate.update({
          where: { id: template.id },
          data: {
            status: "APPROVED",
            submittedAt: new Date(),
            metaUpdatedAt: new Date(),
            metaTemplateName: data.name ?? template.name,
            metaStatus: (data.status ?? "APPROVED").toUpperCase(),
            waTemplateId: data.id ?? template.waTemplateId,
          },
        });
        return { submitted: true, remote: true, remoteId: data.id ?? null, warning: null };
      }
      const body = await res.text();
      logger.warn("[template] Meta submission failed", { status: res.status, detail: body.slice(0, 300) });
      return { submitted: false, remote: false, remoteId: null, warning: `Meta API rejected the submission (${res.status}). Recorded locally — complete it from the Meta dashboard.` };
    } catch (err) {
      logger.warn("[template] Meta submission error", (err as Error).message);
      return { submitted: false, remote: false, remoteId: null, warning: "Could not reach the Meta API. Recorded locally — complete it from the Meta dashboard." };
    }
  }

  // Local-only submission (no credentials configured).
  return { submitted: false, remote: false, remoteId: null, warning: "WhatsApp API is not configured for this number. Recorded locally — complete the submission from the Meta dashboard." };
}

/** Local workflow helper: mark a template as submitted (status + meta status bookkeeping). */
export async function markTemplateSubmitted(id: string): Promise<{ submitted: boolean; remote: boolean; remoteId: string | null; warning: string | null }> {
  const template = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!template) throw new Error("Template not found");
  if (template.status === "ARCHIVED") throw new Error("Archived templates cannot be submitted");

  const result = await submitTemplateToMeta(template);
  // Keep the submitted bookkeeping consistent whether or not the remote call succeeded.
  if (!result.submitted) {
    await prisma.messageTemplate.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        metaStatus: result.remote ? "PENDING" : "PENDING",
        submittedAt: new Date(),
        metaUpdatedAt: new Date(),
        metaRejectionReason: null,
      },
    });
    if (result.remoteId) {
      await prisma.messageTemplate.update({ where: { id }, data: { waTemplateId: result.remoteId } });
    }
  }
  return result;
}

export async function markTemplateMetaStatus(id: string, data: { metaStatus: string; reason?: string }): Promise<void> {
  const status = data.metaStatus.toUpperCase();
  const allowed = ["APPROVED", "REJECTED", "PENDING", "PAUSED", "DISABLED", "IN_APPEAL"];
  if (!allowed.includes(status)) throw new Error(`Invalid Meta status. Allowed: ${allowed.join(", ")}`);

  const patch: Record<string, unknown> = {
    metaStatus: status,
    metaUpdatedAt: new Date(),
    metaRejectionReason: status === "REJECTED" || status === "DISABLED" ? data.reason ?? "Rejected by Meta" : null,
  };
  if (status === "APPROVED") {
    patch.status = "APPROVED";
    patch.metaTemplateName = undefined; // keep existing
  } else if (status === "REJECTED") {
    patch.status = "REJECTED";
  } else if (status === "PENDING") {
    patch.status = "SUBMITTED";
  }
  delete patch.metaTemplateName;

  await prisma.messageTemplate.update({ where: { id }, data: patch });
}

/** Increment usage counters when a template is used for an outbound send. */
export async function incrementTemplateUsage(id: string | null | undefined): Promise<void> {
  if (!id) return;
  await prisma.messageTemplate.update({ where: { id }, data: { usageCount: { increment: 1 } } }).catch(() => undefined);
}

/** Build the Meta payload for a template draft (used by the UI preview). */
export function previewTemplatePayload(input: {
  name: string;
  category: string;
  language: string;
  header?: string | null;
  body: string;
  footer?: string | null;
  buttons?: unknown;
}): Record<string, unknown> {
  return buildMetaPayload({
    name: input.name,
    category: input.category,
    language: input.language,
    header: input.header ?? null,
    body: input.body,
    footer: input.footer ?? null,
    buttons: input.buttons,
  });
}