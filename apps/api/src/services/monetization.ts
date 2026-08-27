import crypto from "crypto";
import { GateStatus } from "@prisma/client";
import type { AdProvider, AdSnippet, MonetizationGate, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { logger } from "../lib/logger";
import { recordVerifiedRevenue } from "./revenue";

// ============================================================
// Monetization core service.
//
// Owns: settings, gates, verification codes, events and ad
// selection. It is deliberately free of WhatsApp / game concerns
// so it can be used both by the game engine (WhatsApp side) and
// the public monetization page (web side) without circular
// imports. The game engine adds the bot messaging layer.
// ============================================================

// ── Settings ────────────────────────────────────────────────

export type MonetizationSettings = {
  enabled: boolean;
  roundInterval: number;
  countdownSeconds: number;
  codeExpiryMinutes: number;
  linkExpiryMinutes: number;
  maxAttempts: number;
  codeLength: number;
  codeType: "numeric" | "alphanumeric";
  rotation: "priority" | "random";
  defaultProviderId: string;
  defaultSnippetId: string;
  directLink: string;
  directLinkEnabled: boolean;
};

const SETTINGS_DEFAULTS: Record<string, string> = {
  "monetization.enabled": "false",
  "monetization.roundInterval": "3",
  "monetization.countdownSeconds": "15",
  "monetization.codeExpiryMinutes": "10",
  "monetization.linkExpiryMinutes": "30",
  "monetization.maxAttempts": "5",
  "monetization.codeLength": "6",
  "monetization.codeType": "numeric",
  "monetization.rotation": "priority",
  "monetization.defaultProviderId": "",
  "monetization.defaultSnippetId": "",
  "monetization.directLink": "",
  "monetization.directLinkEnabled": "true",
};

async function readSettings(): Promise<MonetizationSettings> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: "monetization." } } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const raw = (key: string): string => map[key] ?? SETTINGS_DEFAULTS[key] ?? "";
  const num = (key: string, fallback: number): number => {
    const n = Number(raw(key));
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    enabled: ["1", "true", "yes", "on"].includes(raw("monetization.enabled").toLowerCase()),
    roundInterval: Math.max(1, num("monetization.roundInterval", 3)),
    countdownSeconds: Math.max(0, num("monetization.countdownSeconds", 15)),
    codeExpiryMinutes: Math.max(1, num("monetization.codeExpiryMinutes", 10)),
    linkExpiryMinutes: Math.max(1, num("monetization.linkExpiryMinutes", 30)),
    maxAttempts: Math.max(1, num("monetization.maxAttempts", 5)),
    codeLength: Math.min(10, Math.max(4, num("monetization.codeLength", 6))),
    codeType: raw("monetization.codeType") === "alphanumeric" ? "alphanumeric" : "numeric",
    rotation: raw("monetization.rotation") === "random" ? "random" : "priority",
    defaultProviderId: raw("monetization.defaultProviderId"),
    defaultSnippetId: raw("monetization.defaultSnippetId"),
    directLink: raw("monetization.directLink"),
    directLinkEnabled: ["1", "true", "yes", "on"].includes(raw("monetization.directLinkEnabled").toLowerCase()),
  };
}

export async function getMonetizationSettings(): Promise<MonetizationSettings> {
  try {
    return await readSettings();
  } catch (err) {
    logger.warn("[monetization] settings read failed, using defaults", (err as Error).message);
    return readSettingsFromDefaults();
  }
}

function readSettingsFromDefaults(): MonetizationSettings {
  const num = (key: string): number => Number(SETTINGS_DEFAULTS[key]) || 0;
  return {
    enabled: false,
    roundInterval: Math.max(1, num("monetization.roundInterval")),
    countdownSeconds: Math.max(0, num("monetization.countdownSeconds")),
    codeExpiryMinutes: Math.max(1, num("monetization.codeExpiryMinutes")),
    linkExpiryMinutes: Math.max(1, num("monetization.linkExpiryMinutes")),
    maxAttempts: Math.max(1, num("monetization.maxAttempts")),
    codeLength: Math.min(10, Math.max(4, num("monetization.codeLength"))),
    codeType: SETTINGS_DEFAULTS["monetization.codeType"] === "alphanumeric" ? "alphanumeric" : "numeric",
    rotation: SETTINGS_DEFAULTS["monetization.rotation"] === "random" ? "random" : "priority",
    defaultProviderId: "",
    defaultSnippetId: "",
    directLink: "",
    directLinkEnabled: true,
  };
}

// ── Crypto helpers ──────────────────────────────────────────

export function generatePublicToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function generateVerificationCode(type: "numeric" | "alphanumeric", length: number): string {
  if (type === "alphanumeric") {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.randomBytes(length);
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(crypto.randomInt(min, max + 1));
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(`400ques:monetization:${code}`).digest("hex");
}

function codesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Events ──────────────────────────────────────────────────

export async function recordEvent(
  type: string,
  opts: { gateId?: string; sessionId?: string; userId?: string; metadata?: Prisma.InputJsonValue } = {}
): Promise<void> {
  try {
    await prisma.monetizationEvent.create({
      data: { type, gateId: opts.gateId ?? null, sessionId: opts.sessionId ?? null, userId: opts.userId ?? null, metadata: (opts.metadata ?? null) as Prisma.InputJsonValue },
    });
  } catch (err) {
    logger.warn("[monetization] event record failed", (err as Error).message);
  }
}

// ── Ad selection ────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick the provider + up to two snippets for a new gate, honoring the
 * configured rotation strategy and default selections.
 */
export async function selectAdsForGate(settings: MonetizationSettings): Promise<{ providerId: string | null; snippetIds: string[] }> {
  const [providers, snippets] = await Promise.all([
    prisma.adProvider.findMany({ where: { enabled: true, archived: false }, orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
    prisma.adSnippet.findMany({ where: { enabled: true, archived: false }, orderBy: [{ priority: "asc" }, { createdAt: "desc" }] }),
  ]);

  let providerId: string | null = null;
  const defaultProvider = settings.defaultProviderId ? providers.find((p: AdProvider) => p.id === settings.defaultProviderId) : undefined;
  providerId = defaultProvider ? defaultProvider.id : (providers[0]?.id ?? null);

  let ordered = snippets;
  if (settings.rotation === "random") ordered = shuffle(snippets);
  else if (settings.defaultSnippetId) {
    const idx = ordered.findIndex((s: AdSnippet) => s.id === settings.defaultSnippetId);
    if (idx >= 0) ordered = [ordered[idx], ...ordered.filter((_, i: number) => i !== idx)];
  }

  return { providerId, snippetIds: ordered.slice(0, 2).map((s) => s.id) };
}

export type PageSnippet = { id: string; name: string; type: string; content: string | null; placement: string };

export async function selectSnippetsForPage(): Promise<{ snippets: PageSnippet[]; directLink: string | null; directLinkEnabled: boolean }> {
  const settings = await getMonetizationSettings();
  let snippets = await prisma.adSnippet.findMany({
    where: { enabled: true, archived: false },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  if (settings.rotation === "random") snippets = shuffle(snippets);
  else if (settings.defaultSnippetId) {
    const idx = snippets.findIndex((s: AdSnippet) => s.id === settings.defaultSnippetId);
    if (idx >= 0) snippets = [snippets[idx], ...snippets.filter((_, i: number) => i !== idx)];
  }

  const top = snippets.slice(0, 2);
  const directLink = settings.directLinkEnabled && settings.directLink ? settings.directLink : (top[0]?.directLink ?? null);

  return {
    snippets: top.map((s) => ({ id: s.id, name: s.name, type: s.type, content: s.content ?? null, placement: s.placement })),
    directLink: settings.directLinkEnabled ? directLink : null,
    directLinkEnabled: settings.directLinkEnabled,
  };
}

export function monetizationLink(gate: { publicToken: string }): string {
  return `${config.webUrl}/monetize/${gate.publicToken}`;
}

// ── Gate lifecycle ──────────────────────────────────────────

export type GateWithRelations = MonetizationGate;

/**
 * Create a gate for a user becoming eligible, or reuse a still-valid
 * PENDING gate (prevents duplicate links when a user pings repeatedly).
 */
export async function getOrCreateGate(
  sessionId: string,
  userId: string,
  round: number
): Promise<MonetizationGate | null> {
  const settings = await getMonetizationSettings();
  if (!settings.enabled) return null;

  const now = new Date();
  const active = await prisma.monetizationGate.findFirst({
    where: { sessionId, userId, status: "PENDING", expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (active) return active;

  const { providerId, snippetIds } = await selectAdsForGate(settings);
  const gate = await prisma.monetizationGate.create({
    data: {
      sessionId,
      userId,
      round,
      publicToken: generatePublicToken(),
      status: "PENDING",
      unlockAt: new Date(Date.now() + settings.countdownSeconds * 1000),
      expiresAt: new Date(Date.now() + settings.linkExpiryMinutes * 60 * 1000),
      providerId,
      snippetIds,
    },
  });
  await recordEvent("GATE_CREATED", { gateId: gate.id, sessionId, userId, metadata: { round } });
  return gate;
}

/**
 * Determine whether a user is currently blocked by a gate.
 * Returns an active PENDING gate, or — when the previous gate died
 * (expired/failed) without being completed — a freshly recreated one
 * (the user receives a new link). Never returns a gate for a user who
 * was never gated this turn, so normal gameplay is never falsely locked.
 */
export async function resolveBlockingGate(
  sessionId: string,
  userId: string,
  round: number
): Promise<{ gate: MonetizationGate | null; recreated: boolean }> {
  const settings = await getMonetizationSettings();
  if (!settings.enabled) return { gate: null, recreated: false };

  const now = new Date();

  const active = await prisma.monetizationGate.findFirst({
    where: { sessionId, userId, status: "PENDING", expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (active) return { gate: active, recreated: false };

  const latest = await prisma.monetizationGate.findFirst({
    where: { sessionId, userId },
    orderBy: { createdAt: "desc" },
  });

  // Verified on an earlier turn → nothing blocking this user now.
  if (!latest || latest.status === GateStatus.VERIFIED || latest.status === GateStatus.CANCELLED) {
    return { gate: null, recreated: false };
  }

  if (latest.status === GateStatus.PENDING) {
    await prisma.monetizationGate.update({ where: { id: latest.id }, data: { status: GateStatus.EXPIRED } });
    await recordEvent("GATE_EXPIRED", { gateId: latest.id, sessionId, userId, metadata: { reason: "link_expired" } });
  }

  const { providerId, snippetIds } = await selectAdsForGate(settings);
  const gate = await prisma.monetizationGate.create({
    data: {
      sessionId,
      userId,
      round,
      publicToken: generatePublicToken(),
      status: "PENDING",
      unlockAt: new Date(Date.now() + settings.countdownSeconds * 1000),
      expiresAt: new Date(Date.now() + settings.linkExpiryMinutes * 60 * 1000),
      providerId,
      snippetIds,
    },
  });
  await recordEvent("GATE_CREATED", { gateId: gate.id, sessionId, userId, metadata: { round, recreated: true } });
  return { gate, recreated: true };
}

export function looksLikeCode(text: string, length: number, type: "numeric" | "alphanumeric"): boolean {
  const normalized = text.trim().toUpperCase();
  if (normalized.length !== length) return false;
  if (type === "numeric") return /^\d+$/.test(normalized);
  return /^[A-Z0-9]+$/.test(normalized);
}

/**
 * Attempt to verify a code submitted through WhatsApp.
 * Returns fine-grained reasons so the game engine can pick messaging.
 */
export type VerifyOutcome =
  | { ok: true; gate: MonetizationGate }
  | { ok: false; reason: "NO_ACTIVE_GATE" | "NOT_YOUR_GATE" | "NO_CODE" | "INVALID_CODE" | "EXPIRED_CODE" | "MAX_ATTEMPTS" };

export async function verifyGateCode(
  sessionId: string,
  userId: string,
  gateId: string,
  rawCode: string
): Promise<VerifyOutcome> {
  const gate = await prisma.monetizationGate.findUnique({ where: { id: gateId } });
  if (!gate) return { ok: false, reason: "NO_ACTIVE_GATE" };
  if (gate.sessionId !== sessionId || gate.userId !== userId) return { ok: false, reason: "NOT_YOUR_GATE" };
  if (gate.status !== GateStatus.PENDING) {
    const reason = gate.status === GateStatus.EXPIRED ? "EXPIRED_CODE" : gate.status === GateStatus.FAILED ? "MAX_ATTEMPTS" : "NO_ACTIVE_GATE";
    return { ok: false, reason };
  }

  const settings = await getMonetizationSettings();

  if (!gate.code || !gate.codeExpiresAt) {
    return { ok: false, reason: "NO_CODE" };
  }
  if (gate.codeExpiresAt < new Date()) {
    await expireGate(gate.id, GateStatus.EXPIRED, "code_expired");
    return { ok: false, reason: "EXPIRED_CODE" };
  }
  if (gate.attempts >= settings.maxAttempts) {
    await expireGate(gate.id, GateStatus.FAILED, "max_attempts");
    return { ok: false, reason: "MAX_ATTEMPTS" };
  }

  const submitted = rawCode.trim().toUpperCase();
  const valid = codesEqual(submitted, gate.code);

  if (!valid) {
    const attempts = gate.attempts + 1;
    await prisma.monetizationGate.update({ where: { id: gate.id }, data: { attempts } });
    await recordEvent("VERIFICATION_FAILED", { gateId: gate.id, sessionId, userId, metadata: { attempts } });
    if (attempts >= settings.maxAttempts) {
      await expireGate(gate.id, GateStatus.FAILED, "max_attempts");
      return { ok: false, reason: "MAX_ATTEMPTS" };
    }
    return { ok: false, reason: "INVALID_CODE" };
  }

  const attempts = gate.attempts + 1;
  await prisma.monetizationGate.update({
    where: { id: gate.id },
    data: { status: GateStatus.VERIFIED, verifiedAt: new Date(), attempts },
  });
  await recordEvent("VERIFICATION_SUCCESS", { gateId: gate.id, sessionId, userId, metadata: { attempts } });
  await recordVerifiedRevenue(gate);
  return { ok: true, gate: { ...gate, status: GateStatus.VERIFIED, attempts } };
}

export async function expireGate(gateId: string, status: GateStatus, reason?: string): Promise<void> {
  const gate = await prisma.monetizationGate.findUnique({ where: { id: gateId } });
  if (!gate || gate.status !== GateStatus.PENDING) return;
  await prisma.monetizationGate.update({ where: { id: gateId }, data: { status } });
  await recordEvent(status === GateStatus.FAILED ? "GATE_CANCELLED" : "GATE_EXPIRED", {
    gateId,
    sessionId: gate.sessionId,
    userId: gate.userId,
    metadata: reason ? { reason } : undefined,
  });
}

/** Cancel all pending gates for a session (used when a session ends). */
export async function cancelGatesForSession(sessionId: string): Promise<void> {
  const pending = await prisma.monetizationGate.findMany({ where: { sessionId, status: GateStatus.PENDING } });
  for (const g of pending) {
    await prisma.monetizationGate.update({ where: { id: g.id }, data: { status: GateStatus.CANCELLED } });
    await recordEvent("GATE_CANCELLED", { gateId: g.id, sessionId, userId: g.userId, metadata: { reason: "session_ended" } });
  }
}

// ── Public page support ─────────────────────────────────────

export type GatePublicStatus = {
  status: "valid" | "verified" | "expired" | "invalid" | "failed" | "cancelled";
  remainingMs?: number;
  countdownSeconds?: number;
  codeAvailable?: boolean;
};

export async function getGateStatusByToken(token: string): Promise<GatePublicStatus> {
  const gate = await prisma.monetizationGate.findUnique({ where: { publicToken: token } });
  if (!gate) return { status: "invalid" };

  if (gate.status === GateStatus.VERIFIED) return { status: "verified" };
  if (gate.status === GateStatus.CANCELLED) return { status: "cancelled" };
  if (gate.status === GateStatus.FAILED) return { status: "failed" };
  if (gate.status === GateStatus.EXPIRED || gate.expiresAt < new Date()) {
    return { status: "expired" };
  }

  const now = Date.now();
  const remainingMs = Math.max(0, gate.unlockAt.getTime() - now);
  const codeAvailable = Boolean(gate.code && gate.codeExpiresAt && gate.codeExpiresAt > new Date());

  return {
    status: "valid",
    remainingMs,
    countdownSeconds: Math.ceil(remainingMs / 1000),
    codeAvailable,
  };
}

export async function requestVerificationCode(
  token: string
): Promise<{ ok: boolean; code?: string; reason?: string }> {
  const gate = await prisma.monetizationGate.findUnique({ where: { publicToken: token } });
  if (!gate) return { ok: false, reason: "invalid" };
  if (gate.status === GateStatus.VERIFIED) return { ok: false, reason: "verified" };
  if (gate.status === GateStatus.CANCELLED) return { ok: false, reason: "cancelled" };
  if (gate.status === GateStatus.FAILED) return { ok: false, reason: "failed" };
  if (gate.status === GateStatus.EXPIRED || gate.expiresAt < new Date()) {
    await expireGate(gate.id, GateStatus.EXPIRED, "link_expired_on_request");
    return { ok: false, reason: "expired" };
  }

  const settings = await getMonetizationSettings();

  // Server-side countdown enforcement — the frontend timer is only visual.
  if (gate.unlockAt > new Date()) {
    return { ok: false, reason: "countdown" };
  }

  // Reuse an existing, still-valid code across refreshes / tabs.
  if (gate.code && gate.codeExpiresAt && gate.codeExpiresAt > new Date()) {
    await recordEvent("CODE_REQUESTED", { gateId: gate.id, sessionId: gate.sessionId, userId: gate.userId });
    return { ok: true, code: gate.code };
  }

  const code = generateVerificationCode(settings.codeType, settings.codeLength);
  const codeExpiresAt = new Date(Date.now() + settings.codeExpiryMinutes * 60 * 1000);
  await prisma.monetizationGate.update({
    where: { id: gate.id },
    data: { code, codeHash: hashCode(code), codeExpiresAt },
  });
  await recordEvent("CODE_REQUESTED", { gateId: gate.id, sessionId: gate.sessionId, userId: gate.userId });
  await recordEvent("CODE_GENERATED", {
    gateId: gate.id,
    sessionId: gate.sessionId,
    userId: gate.userId,
    metadata: { codeLength: code.length, codeType: settings.codeType },
  });
  return { ok: true, code };
}

// ── Admin analytics foundation ──────────────────────────────

export async function getMonetizationStats() {
  const [total, pending, verified, expired, failed, cancelled, verifiedWithTime] = await Promise.all([
    prisma.monetizationGate.count(),
    prisma.monetizationGate.count({ where: { status: GateStatus.PENDING } }),
    prisma.monetizationGate.count({ where: { status: GateStatus.VERIFIED } }),
    prisma.monetizationGate.count({ where: { status: GateStatus.EXPIRED } }),
    prisma.monetizationGate.count({ where: { status: GateStatus.FAILED } }),
    prisma.monetizationGate.count({ where: { status: GateStatus.CANCELLED } }),
    prisma.monetizationGate.findMany({
      where: { status: GateStatus.VERIFIED, verifiedAt: { not: null } },
      select: { createdAt: true, verifiedAt: true },
    }),
  ]);

  const avgSeconds = verifiedWithTime.length
    ? verifiedWithTime.reduce((sum, g) => sum + (g.verifiedAt!.getTime() - g.createdAt.getTime()) / 1000, 0) / verifiedWithTime.length
    : 0;

  const failedEvents = await prisma.monetizationEvent.count({ where: { type: "VERIFICATION_FAILED" } });

  const last7Days = await prisma.monetizationGate.groupBy({
    by: ["createdAt"],
    _count: { _all: true },
    where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
  });

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const byDay: Record<string, number> = {};
  for (const r of last7Days) byDay[dayKey(r.createdAt)] = r._count._all;

  const successRate = total ? Math.round((verified / total) * 1000) / 10 : 0;

  return {
    total,
    pending,
    verified,
    expired,
    failed,
    cancelled,
    failedVerifications: failedEvents,
    successRate,
    averageVerificationSeconds: Math.round(avgSeconds * 10) / 10,
    last7Days: byDay,
  };
}