import { QuestionType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { getAllSettings, settingsToRecord, settingBool, settingNumber } from "./settings";
import { logger } from "../lib/logger";

// ============================================================
// Question similarity detection with Google AI
//
// Pipeline:
//   1. Candidate search (DB): same category (prefer same type), ranked by a
//      lightweight local similarity score.
//   2. Deterministic exact-duplicate check on normalized text.
//   3. Google AI structured comparison of the submitted question against the
//      top candidates, returning EXACT_DUPLICATE | VERY_SIMILAR | UNIQUE.
//   4. Safe fallback: if Google AI is disabled/unavailable/returns malformed
//      output, the result reports `reviewRequired` so moderation routes the
//      submission to manual review instead of guessing.
// ============================================================

export type SimilarityClassification = "EXACT_DUPLICATE" | "VERY_SIMILAR" | "UNIQUE";

export type SimilarityMatch = {
  questionId: string;
  text: string;
  type: QuestionType;
  similarity: number;
  reason: string;
};

export type QuestionSimilarityResult = {
  aiAvailable: boolean;
  classification: SimilarityClassification;
  confidence: number;
  score: number;
  matches: SimilarityMatch[];
  model: string | null;
  checkedAt: string;
  reviewRequired: boolean;
  reviewReason: string | null;
};

type SimilarityConfig = {
  enabled: boolean;
  model: string;
  exactThreshold: number;
  similarThreshold: number;
  maxCandidates: number;
};

type Candidate = {
  id: string;
  text: string;
  type: QuestionType;
  playsCount: number;
};

// ============================================================
// Local text helpers
// ============================================================

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

/** Jaccard + length-ratio based similarity in [0,1]. 1.0 only for identical normalized text. */
export function localQuestionSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokenize(na);
  const tb = tokenize(nb);
  const setA = new Set(ta);
  const setB = new Set(tb);
  const inter = new Set([...setA].filter((w) => setB.has(w))).size;
  const union = setA.size + setB.size - inter;
  const jaccard = union === 0 ? 0 : inter / union;
  const lengthRatio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
  return round(Math.max(jaccard, lengthRatio * 0.9));
}

function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

// ============================================================
// Settings
// ============================================================

export async function getSimilarityConfig(): Promise<SimilarityConfig> {
  const rows = await getAllSettings();
  const s = settingsToRecord(rows);
  return {
    enabled: settingBool(s, "ai.duplicateDetectionEnabled", true),
    model: (s["ai.model"] ?? (config.googleAi.model || "gemini-2.0-flash")).trim(),
    exactThreshold: clamp01(settingNumber(s, "contribution.aiThreshold", 0.9)),
    similarThreshold: clamp01(settingNumber(s, "contribution.similarThreshold", 0.6)),
    maxCandidates: Math.min(20, Math.max(1, settingNumber(s, "ai.maxCandidates", 5))),
  };
}

// ============================================================
// Candidate search
// ============================================================

async function findCandidates(question: string, categoryId: string, type: QuestionType, max: number): Promise<Candidate[]> {
  const preferred = await prisma.question.findMany({
    where: { categoryId, status: "APPROVED", type },
    select: { id: true, text: true, type: true, playsCount: true },
    orderBy: [{ playsCount: "desc" }, { createdAt: "desc" }],
    take: 300,
  });

  let pool = preferred;
  if (pool.length < max) {
    const extra = await prisma.question.findMany({
      where: { categoryId, status: "APPROVED", type: { not: type } },
      select: { id: true, text: true, type: true, playsCount: true },
      orderBy: [{ playsCount: "desc" }, { createdAt: "desc" }],
      take: max - pool.length,
    });
    pool = [...pool, ...extra];
  }

  const qn = normalizeText(question);
  return pool
    .map((c) => ({ c, s: localQuestionSimilarity(qn, normalizeText(c.text)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.c);
}

// ============================================================
// Deterministic exact-duplicate check
// ============================================================

/** Exact match when normalized texts are identical (case/punctuation insensitive). */
function exactNormalized(text: string, candidates: Candidate[]): SimilarityMatch | null {
  const t = normalizeText(text);
  if (!t) return null;
  for (const c of candidates) {
    if (normalizeText(c.text) === t) {
      return { questionId: c.id, text: c.text, type: c.type, similarity: 1, reason: "Exact duplicate (identical normalized text)" };
    }
  }
  return null;
}

// ============================================================
// Google AI call
// ============================================================

type ParsedAI = {
  classification: SimilarityClassification;
  confidence: number;
  score: number;
  reason: string;
  matches: { index: number; similarity: number; reason: string }[];
};

function buildPrompt(question: string, candidates: Candidate[]): string {
  const list = candidates
    .map((c, i) => `${i + 1}. [${c.type}] ${c.text}`)
    .join("\n");
  return [
    "You detect duplicate questions for a social trivia game called 400QUES.",
    "Given one NEW question and a numbered list of CANDIDATE questions, compare meaning and wording.",
    "",
    `NEW question: "${question}"`,
    "",
    "CANDIDATE questions:",
    list || "(none)",
    "",
    "Return STRICT JSON only (no markdown, no extra text) with exactly this shape:",
    '{"classification":"EXACT_DUPLICATE"|"VERY_SIMILAR"|"UNIQUE","confidence":0.0-1.0,"score":0.0-1.0,"reason":"short explanation","matches":[{"index":1,"similarity":0.0-1.0,"reason":"why it matches"}]}',
    "",
    "Rules:",
    "- EXACT_DUPLICATE only when wording is essentially identical in meaning AND near-identical in text (confidence >= 0.9).",
    "- VERY_SIMILAR when the closest candidate matches in meaning but is a distinct question.",
    "- UNIQUE when no candidate is meaningfully the same.",
    "- '- score' is the overall similarity of the new question to its closest candidate (0-1).",
    "- '- matches' should list the top 1-3 candidates with similarity >= 0.4, sorted descending by similarity. Use the candidate number from the list above.",
    "- A Truth and a Dare are different question types but can still be textually identical; factor the [TYPE] tag into your judgement and note it in the reason.",
    "- Never invent candidates that are not in the list.",
  ].join("\n");
}

function parseAIJson(raw: string): ParsedAI | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  text = text.slice(start, end + 1);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }

  const classification = parsed.classification;
  if (classification !== "EXACT_DUPLICATE" && classification !== "VERY_SIMILAR" && classification !== "UNIQUE") return null;

  const matches = Array.isArray(parsed.matches)
    ? parsed.matches
        .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
        .map((m) => ({
          index: Number(m.index),
          similarity: clamp01(Number(m.similarity)),
          reason: String(m.reason ?? ""),
        }))
        .filter((m) => Number.isInteger(m.index) && m.index >= 1)
        .slice(0, 3)
    : [];

  return {
    classification,
    confidence: clamp01(Number(parsed.confidence)),
    score: clamp01(Number(parsed.score)),
    reason: String(parsed.reason ?? ""),
    matches,
  };
}

export async function callGoogleAI(question: string, candidates: Candidate[], cfg: SimilarityConfig): Promise<ParsedAI | null> {
  const apiKey = config.googleAi.apiKey;
  if (!apiKey) return null;
  if (!cfg.enabled) return null;

  const url = `${config.googleAi.endpoint}/models/${encodeURIComponent(cfg.model)}:generateContent`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.googleAi.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(question, candidates) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          maxOutputTokens: 1024,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn("[question-similarity] Google AI request failed", `status=${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").filter(Boolean).join("\n") ?? "";
    if (!text.trim()) return null;
    return parseAIJson(text);
  } catch (err) {
    logger.warn("[question-similarity] Google AI call failed", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// Public API
// ============================================================

export async function checkQuestionSimilarity(
  question: string,
  categoryId: string,
  type: QuestionType
): Promise<QuestionSimilarityResult> {
  const cfg = await getSimilarityConfig();
  const candidates = await findCandidates(question, categoryId, type, cfg.maxCandidates);
  const checkedAt = new Date().toISOString();

  // Deterministic exact match always available
  const exact = exactNormalized(question, candidates);
  if (exact) {
    return {
      aiAvailable: false,
      classification: "EXACT_DUPLICATE",
      confidence: 1,
      score: 1,
      matches: [exact],
      model: null,
      checkedAt,
      reviewRequired: false,
      reviewReason: null,
    };
  }

  // Local baseline for confidence even when AI is unavailable
  const localLeader =
    candidates
      .map((c) => ({ c, s: localQuestionSimilarity(question, c.text) }))
      .sort((a, b) => b.s - a.s)[0] ?? null;

  // Google AI structured comparison (best effort)
  const parsed = candidates.length > 0 ? await callGoogleAI(question, candidates, cfg) : null;

  if (parsed) {
    const matches: SimilarityMatch[] = parsed.matches
      .filter((m) => m.index >= 1 && m.index <= candidates.length)
      .slice(0, 3)
      .map((m) => {
        const c = candidates[m.index - 1];
        return {
          questionId: c.id,
          text: c.text,
          type: c.type,
          similarity: m.similarity,
          reason: m.reason,
        };
      });

    // Decision matrix (see PHASE9RESULT.TXT): EXACT_DUPLICATE uses the
    // configured exact threshold (contribution.aiThreshold), never a hardcoded
    // value, so admins can tune rejection strictness.
    if (parsed.classification === "EXACT_DUPLICATE" && parsed.score >= cfg.exactThreshold && parsed.confidence >= cfg.exactThreshold) {
      return {
        aiAvailable: true,
        classification: "EXACT_DUPLICATE",
        confidence: parsed.confidence,
        score: parsed.score,
        matches,
        model: cfg.model,
        checkedAt,
        reviewRequired: false,
        reviewReason: null,
      };
    }

    if (parsed.classification === "VERY_SIMILAR" && parsed.score >= cfg.similarThreshold) {
      return {
        aiAvailable: true,
        classification: "VERY_SIMILAR",
        confidence: parsed.confidence,
        score: parsed.score,
        matches,
        model: cfg.model,
        checkedAt,
        reviewRequired: true,
        reviewReason: `Very similar to an existing question (${Math.round(parsed.score * 100)}% match).`,
      };
    }

    if (parsed.classification === "UNIQUE" && parsed.score < cfg.similarThreshold) {
      return {
        aiAvailable: true,
        classification: "UNIQUE",
        confidence: parsed.confidence,
        score: parsed.score,
        matches,
        model: cfg.model,
        checkedAt,
        reviewRequired: false,
        reviewReason: null,
      };
    }

    // Anything else (low confidence, ambiguous) → manual review, never guess
    return {
      aiAvailable: true,
      classification: "VERY_SIMILAR",
      confidence: parsed.confidence,
      score: parsed.score,
      matches,
      model: cfg.model,
      checkedAt,
      reviewRequired: true,
      reviewReason: parsed.reason || "Classification confidence too low; manual review required.",
    };
  }

  // AI unavailable/disabled/malformed → manual review (never auto-approve on guesswork)
  const reason =
    cfg.enabled && !config.googleAi.apiKey
      ? "AI duplicate detection is not configured (missing GOOGLE_AI_API_KEY); manual review required."
      : "AI duplicate detection is disabled or unavailable; manual review required.";

  return {
    aiAvailable: false,
    classification: "UNIQUE",
    confidence: localLeader?.s ?? 0,
    score: localLeader?.s ?? 0,
    matches: localLeader
      ? [{ questionId: localLeader.c.id, text: localLeader.c.text, type: localLeader.c.type, similarity: localLeader.s, reason: "Similar candidate found locally; confirm manually." }]
      : [],
    model: null,
    checkedAt,
    reviewRequired: true,
    reviewReason: reason,
  };
}

/**
 * Re-check before a contribution is turned into an approved question.
 * Deterministic exact-duplicate check against the same category (prefer same
 * type), used at final approval to catch races and admin overrides.
 */
export async function isExactDuplicateAtApproval(question: string, categoryId: string, type: QuestionType): Promise<boolean> {
  const cfg = await getSimilarityConfig();
  const candidates = await findCandidates(question, categoryId, type, cfg.maxCandidates);
  return exactNormalized(question, candidates) !== null;
}