import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import type { RevenueEventType } from "@prisma/client";
import { AppError } from "../../lib/response";
import { getAdapter, providerServesPlacement } from "./registry";
import type { CallbackInput, CallbackValidation } from "./types";
import { recordEvent } from "../monetization";
import { getRevenueSettings } from "../revenue";

// ============================================================
// Provider-agnostic callback / event handling.
//
// A single generic mechanism: the provider posts back to
// /api/monetization/callbacks/:providerId, the adapter validates the
// request (secret/token/HMAC), we de-duplicate and record it, and —
// only for confirmed conversion/verification callbacks — we promote
// matching estimated revenue to confirmed via the ledger.
// ============================================================

// Idempotency key used to reject replay of the same provider postback.
function callbackKey(providerId: string, eventType: string, providerReference?: string): string {
  return `ad-callback:${providerId}:${eventType}:${providerReference ?? "unknown"}`;
}

async function alreadyProcessed(key: string): Promise<boolean> {
  try {
    return (await prisma.processedEvent.findUnique({ where: { eventId: key } })) !== null;
  } catch {
    return false;
  }
}

async function markProcessed(key: string): Promise<void> {
  try {
    await prisma.processedEvent.create({ data: { eventId: key, kind: "ad-callback" } });
  } catch {
    // Duplicate key → already processed; safe to ignore.
  }
}

/**
 * Validate, de-duplicate and record an incoming provider callback.
 * Throws an AppError on invalid/unauthenticated callbacks so the caller
 * can return an appropriate HTTP status.
 */
export async function handleProviderCallback(providerId: string, input: CallbackInput): Promise<CallbackValidation> {
  const provider = await prisma.adProvider.findUnique({ where: { id: providerId } });
  if (!provider || provider.archived) {
    throw new AppError(404, "Provider not found");
  }

  const adapter = getAdapter(provider.type);
  const validation = adapter.validateCallback(
    {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      description: provider.description,
      enabled: provider.enabled,
      archived: provider.archived,
      priority: provider.priority,
      configuration: provider.configuration,
      placements: provider.placements,
    },
    input
  );

  if (!validation.valid) {
    await recordEvent("CALLBACK", { providerId, metadata: { reason: validation.reason ?? "invalid_callback" } });
    throw new AppError(401, validation.reason ?? "Invalid callback");
  }

  const eventType = validation.eventType ?? "CALLBACK";
  const key = callbackKey(provider.id, eventType, validation.providerReference);

  if (await alreadyProcessed(key)) {
    // Not an error — idempotent replay. Silently acknowledge.
    return { ...validation, valid: true, reason: "duplicate_ignored" };
  }

  await recordEvent("CALLBACK", { providerId, placement: undefined, metadata: { eventType, method: (validation.metadata as Record<string, unknown> | undefined)?.method ?? "unknown", providerReference: validation.providerReference } });

  // Confirmed postbacks may promote estimated revenue to confirmed. Do NOT
  // fabricate amounts: we re-use our own stored estimates.
  if (eventType === "CONVERSION" || eventType === "VERIFICATION") {
    await confirmEstimatedRevenueForProvider(provider.id, eventType);
  }

  await markProcessed(key);
  return validation;
}

/**
 * Promote the most recent ESTIMATED revenue rows for a provider to
 * CONFIRMED once the provider has actually reported the conversion. This
 * is the only path that sets `isEstimated = false`; amounts are taken from
 * existing ESTIMATED rows (never synthesized).
 */
async function confirmEstimatedRevenueForProvider(providerId: string, eventType: string): Promise<void> {
  const settings = await getRevenueSettings();
  // CONVERSION postbacks promote estimated click/impression revenue to
  // confirmed; VERIFICATION postbacks promote estimated verification revenue.
  const targetEventType = eventType === "VERIFICATION" ? "VERIFICATION" : ("CLICK" as string);

  const rows = await prisma.revenueLedger.findMany({
    where: { providerId, isEstimated: true, status: "pending", eventType: targetEventType as RevenueEventType },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  let confirmed = 0;
  for (const row of rows) {
    await prisma.revenueLedger.update({
      where: { id: row.id },
      data: { isEstimated: false, status: "confirmed", confirmedAt: new Date(), notes: `Confirmed via provider callback (${eventType})` },
    });
    confirmed++;
  }

  if (confirmed > 0) {
    logger.info("[adproviders] confirmed revenue from callback", { providerId, eventType, confirmed });
  }
  void settings;
  void targetEventType;
}
