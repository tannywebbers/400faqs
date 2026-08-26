import OpenAI from "openai";
import { config } from "../config";
import { logger } from "./logger";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!config.openai.apiKey) return null;
  if (!client) {
    client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return client;
}

export type ModerationResult = {
  ok: boolean;
  flagged: boolean;
  spam: boolean;
  profanity: boolean;
  gibberish: boolean;
  score: number;
  reason: string | null;
};

/**
 * Deterministic guard rails that run even without an OpenAI key.
 * Then, when a key is present, an LLM review enriches the checks.
 */
export async function moderateContent(text: string): Promise<ModerationResult> {
  const t = text.trim();

  let profanity = false;
  let spam = false;
  let gibberish = false;
  let score = 1;

  const lower = t.toLowerCase();

  const blockedWords = ["fuck", "shit", "bitch", "asshole", "cunt", "nigga", "whore", "slut", "porn", "sex tape"];
  const spamPatterns = [
    /(?:^|\s)(buy|order|cheap|discount|offer|free now|limited time|click here|http|www\.|\.com)\b/i,
    /(join|subscribe|follow) @?\w+ to (win|get)/i,
  ];
  const gibberishPattern = /^[^a-z]{5,}$/i; // no letters

  if (t.length < 2) {
    gibberish = true;
    score = 0;
  }
  if (gibberishPattern.test(lower) && t.length > 3) {
    gibberish = true;
    score = Math.min(score, 0.1);
  }
  if (blockedWords.some((w) => lower.includes(w))) {
    profanity = true;
    score = Math.min(score, 0.05);
  }
  if (spamPatterns.some((p) => p.test(lower))) {
    spam = true;
    score = Math.min(score, 0.2);
  }

  const reason = profanity
    ? "Contains inappropriate language"
    : spam
      ? "Looks like spam or an advertisement"
      : gibberish
        ? "Question does not look like readable text"
        : null;

  // LLM enrichment (best effort)
  const openai = getOpenAI();
  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: config.openai.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You moderate questions for a social game. Respond ONLY with JSON: {"profanity":bool,"spam":bool,"gibberish":bool,"offensive":bool,"grammarIssue":bool,"score":number 0-1 (1 = perfect). Return a reason string when score<1.',
          },
          { role: "user", content: `Question to moderate: "${t}"` },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const llmScore = Number(parsed.score ?? 1);
      score = Math.min(score, llmScore);
      profanity = profanity || Boolean(parsed.profanity) || Boolean(parsed.offensive);
      spam = spam || Boolean(parsed.spam);
      gibberish = gibberish || Boolean(parsed.gibberish);
      if (score < 1 && !reason) {
        logger.info("[ai] low score", { score });
      }
    } catch (err) {
      logger.warn("[ai] moderation LLM failed, using heuristics", (err as Error).message);
    }
  }

  return {
    ok: score >= 0.6 && !profanity && !spam && !gibberish,
    flagged: score < 0.85,
    spam,
    profanity,
    gibberish,
    score: round(score),
    reason,
  };
}

export type DuplicateResult = {
  exact: boolean;
  similar: boolean;
  score: number;
  matches: { id: string; text: string; score: number }[];
};

/** Lightweight local similarity + optional LLM duplicate check. */
export async function checkDuplicates(question: string, existing: { id: string; text: string }[]): Promise<DuplicateResult> {
  const q = normalize(question);
  let best = 0;
  let bestId: string | null = null;

  for (const item of existing) {
    const s = similarity(q, normalize(item.text));
    if (s > best) {
      best = s;
      bestId = item.id;
    }
  }

  const openai = getOpenAI();
  let aiScore = best;
  if (openai && existing.length > 0 && best < 0.95) {
    try {
      const top = existing
        .slice()
        .sort((a, b) => similarity(q, normalize(b.text)) - similarity(q, normalize(a.text)))
        .slice(0, 5);
      const completion = await openai.chat.completions.create({
        model: config.openai.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'You detect duplicate questions. Given a new question and a list, return JSON: {"exact":bool,"similar":bool,"score":number 0-1 similarity}. Consider paraphrases as similar.',
          },
          {
            role: "user",
            content: `New: "${question}"\nExisting:\n${top.map((x, i) => `${i + 1}. ${x.text}`).join("\n")}`,
          },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      aiScore = Math.max(aiScore, Number(parsed.score ?? best));
    } catch (err) {
      logger.warn("[ai] duplicate LLM failed, using local", (err as Error).message);
    }
  }

  const exact = aiScore >= 0.9;
  const similar = aiScore >= 0.55;

  return {
    exact,
    similar,
    score: round(aiScore),
    matches: bestId ? [{ id: bestId, text: question, score: round(aiScore) }] : [],
  };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return s.split(" ").filter(Boolean);
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  const setA = new Set(ta);
  const setB = new Set(tb);
  if (setA.size === 0 && setB.size === 0) return 1;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  const jaccard = inter / (setA.size + setB.size - inter);
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return Math.max(jaccard, lenRatio * 0.9);
}

function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}
