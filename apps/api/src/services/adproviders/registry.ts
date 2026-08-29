import crypto from "crypto";
import {
  type AdAdapter,
  type AdProviderRecord,
  type AdProviderType,
  type CallbackInput,
  type CallbackValidation,
  type RenderResult,
} from "./types";

// ============================================================
// Generic provider adapters.
//
// Each provider "type" is implemented once here. There is NO vendor
// specific branch anywhere else in the codebase. To add a new ad
// network today you simply create an AdProvider row whose `type`
// matches one of these and configure it — no code changes.
// ============================================================

type Cfg = Record<string, unknown>;

function asString(cfg: Cfg, key: string): string {
  const v = cfg[key];
  return typeof v === "string" ? v : "";
}

function asBool(cfg: Cfg, key: string, fallback = false): boolean {
  const v = cfg[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  return fallback;
}

// Helpers shared by several adapters ---------------------------------

function htmlFor(record: AdProviderRecord, body: string): RenderResult {
  return { html: `<div class="ad-unit ad-unit--${safeClass(record.name)}" data-ad-provider="${record.id}">${body}</div>` };
}

function safeClass(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "provider";
}

function result(record: AdProviderRecord, render: RenderResult): RenderResult {
  return { ...render, meta: { provider: record.name, providerType: record.type } };
}

function cfg(record: AdProviderRecord): Cfg {
  if (!record.configuration || typeof record.configuration !== "object" || Array.isArray(record.configuration)) return {};
  return record.configuration as Cfg;
}

// ── SCRIPT: inject a raw HTML/JS tag ──────────────────────────────
const scriptAdapter: AdAdapter = {
  type: "SCRIPT",
  async render(record, _placement) {
    const c = cfg(record);
    const snippet = asString(c, "script") || asString(c, "content") || asString(c, "html");
    if (!snippet) {
      return result(record, { html: `<div class="ad-unit ad-unit--${safeClass(record.name)}">${escapeHtml(record.name)}</div>` });
    }
    return result(record, { html: `<div class="ad-unit" data-ad-provider="${record.id}">${snippet}</div>` });
  },
  validateCallback() {
    return { valid: false, reason: "SCRIPT providers do not present callbacks" };
  },
  validateConfig(record) {
    const c = cfg(record);
    const errors: string[] = [];
    if (asString(c, "script") === "" && asString(c, "content") === "" && asString(c, "html") === "") {
      errors.push("Provide a script/content/html value to render.");
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  },
};

// ── DIRECT_LINK: a plain sponsored destination URL ────────────────
const directLinkAdapter: AdAdapter = {
  type: "DIRECT_LINK",
  async render(record, placement, ctx) {
    const c = cfg(record);
    const url = ctx?.providerPlacementId || asString(c, "url") || asString(c, "link");
    const label = asString(c, "label") || "Visit sponsor";
    if (!url) return null;
    return result(record, { url, label, meta: { track: true, placement } });
  },
  validateCallback() {
    return { valid: false, reason: "DIRECT_LINK providers do not present callbacks" };
  },
  validateConfig(record) {
    const c = cfg(record);
    const errors: string[] = [];
    const url = asString(c, "url") || asString(c, "link");
    if (!url) errors.push("Provide a destination url/link.");
    else if (!/^https?:\/\//i.test(url)) errors.push("url/link must be an http(s) URL.");
    return { valid: errors.length === 0, errors, warnings: ["DIRECT_LINK only tracks click-throughs."] };
  },
};

// ── REDIRECT: full-page/step redirect to an external destination ──
const redirectAdapter: AdAdapter = {
  type: "REDIRECT",
  async render(record, placement, ctx) {
    const c = cfg(record);
    const url = ctx?.providerPlacementId || asString(c, "url") || asString(c, "target");
    const label = asString(c, "label") || "Continue";
    if (!url) return null;
    return result(record, { url, redirect: true, label, meta: { track: true, placement } });
  },
  validateCallback() {
    return { valid: false, reason: "REDIRECT providers do not present callbacks" };
  },
  validateConfig(record) {
    const c = cfg(record);
    const errors: string[] = [];
    const url = asString(c, "url") || asString(c, "target");
    if (!url) errors.push("Provide a target url.");
    else if (!/^https?:\/\//i.test(url)) errors.push("target url must be an http(s) URL.");
    return { valid: errors.length === 0, errors, warnings: ["REDIRECT providers navigate the user off-site."] };
  },
};

// ── SNIPPET: self-contained inline HTML ───────────────────────────
const snippetAdapter: AdAdapter = {
  type: "SNIPPET",
  async render(record, placement, ctx) {
    const c = cfg(record);
    const html = asString(c, "html") || asString(c, "content");
    const cta = asString(c, "cta") || asString(c, "label");
    const url = ctx?.providerPlacementId || asString(c, "url") || asString(c, "link");
    if (!html && !cta) {
      return result(record, { html: `<div class="ad-unit ad-unit--${safeClass(record.name)}">${escapeHtml(record.name)}</div>` });
    }
    if (html) {
      return result(record, { html: `<div class="ad-unit" data-ad-provider="${record.id}">${html}</div>` });
    }
    const click = url ? `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer nofollow" class="ad-unit__cta" data-ad-provider="${record.id}">${escapeHtml(cta)}</a>` : escapeHtml(cta);
    return result(record, { html: `<div class="ad-unit ad-unit--${safeClass(record.name)}">${click}</div>` });
  },
  validateCallback() {
    return { valid: false, reason: "SNIPPET providers do not present callbacks" };
  },
  validateConfig(record) {
    const c = cfg(record);
    const errors: string[] = [];
    if (asString(c, "html") === "" && asString(c, "cta") === "" && asString(c, "content") === "") {
      errors.push("Provide html/content or a cta label.");
    }
    return { valid: errors.length === 0, errors, warnings: [] };
  },
};

// ── API: fetch ad content from a provider endpoint ───────────────
const apiAdapter: AdAdapter = {
  type: "API",
  async render(record, placement) {
    const c = cfg(record);
    const endpoint = asString(c, "endpoint") || asString(c, "apiUrl");
    // The actual network fetch is intentionally a no-op in this build-only
    // phase: the adapter contract is in place and a fetch implementation
    // can be wired later without touching application logic. Admins can
    // still store pre-rendered fallback html/url in `configuration`.
    const fallbackHtml = asString(c, "fallbackHtml") || asString(c, "fallback");
    if (endpoint && !fallbackHtml) {
      return result(record, {
        html: `<div class="ad-unit ad-unit--${safeClass(record.name)}" data-ad-provider="${record.id}" data-ad-api="${escapeAttr(endpoint)}" data-ad-placement="${escapeAttr(placement)}">${escapeHtml(record.name)}</div>`,
      });
    }
    if (fallbackHtml) {
      return result(record, { html: `<div class="ad-unit" data-ad-provider="${record.id}">${fallbackHtml}</div>` });
    }
    return null;
  },
  validateCallback() {
    return { valid: false, reason: "API providers require a fetch client; callbacks not configured for this type" };
  },
  validateConfig(record) {
    const c = cfg(record);
    const errors: string[] = [];
    const endpoint = asString(c, "endpoint") || asString(c, "apiUrl");
    if (!endpoint && asString(c, "fallbackHtml") === "") errors.push("Provide an endpoint or a fallbackHtml payload.");
    else if (endpoint && !/^https?:\/\//i.test(endpoint)) errors.push("endpoint must be an http(s) URL.");
    return { valid: errors.length === 0, errors, warnings: endpoint ? ["API fetch is not yet wired; fallback payload will be served."] : [] };
  },
};

// ── CPA / VERIFICATION: drive and credit an in-app paid action ────
const cpaAdapter: AdAdapter = {
  type: "CPA",
  async render(record, placement, ctx) {
    return result(record, {
      url: ctx?.providerPlacementId || asString(cfg(record), "url") || undefined,
      label: asString(cfg(record), "label") || "Explore our partner",
      meta: { cpa: true, placement, action: asString(cfg(record), "action") || "VERIFICATION" },
    });
  },
  validateCallback(record, input) {
    return validateBySecret(record, input, "CONVERSION");
  },
  validateConfig(record) {
    const c = cfg(record);
    const errors: string[] = [];
    const url = asString(c, "url");
    if (!url) errors.push("Provide a url for the CPA offer.");
    return { valid: errors.length === 0, errors, warnings: [] };
  },
};

const verificationAdapter: AdAdapter = {
  type: "VERIFICATION",
  async render(record, placement) {
    return result(record, {
      label: asString(cfg(record), "label") || "Verify to continue",
      meta: { placement, verification: true },
    });
  },
  validateCallback(record, input) {
    // Must be driven by the existing in-app gate; only a provider-confirmed
    // postback may mark revenue confirmed.
    return validateBySecret(record, input, "VERIFICATION");
  },
  validateConfig(record) {
    return { valid: true, errors: [], warnings: ["VERIFICATION providers validate via callback secret."] };
  },
};

// ── OTHER: passthrough ────────────────────────────────────────────
const otherAdapter: AdAdapter = {
  type: "OTHER",
  async render(record, _placement) {
    const c = cfg(record);
    const html = asString(c, "html") || asString(c, "content");
    const url = asString(c, "url") || asString(c, "link");
    const label = asString(c, "label") || asString(c, "html");
    if (html) return result(record, { html: `<div class="ad-unit" data-ad-provider="${record.id}">${html}</div>` });
    if (url) return result(record, { url, label: label || "Learn more" });
    return result(record, { html: `<div class="ad-unit ad-unit--${safeClass(record.name)}">${escapeHtml(record.name)}</div>` });
  },
  validateCallback(record, input) {
    return validateBySecret(record, input, "CALLBACK");
  },
  validateConfig(_record) {
    return { valid: true, errors: [], warnings: ["OTHER: adapter passes configuration through verbatim."] };
  },
};

// Shared callback validation: the provider posts back and must present a
// shared/secret token or HMAC so we never trust an unauthenticated callback.
function validateBySecret(record: AdProviderRecord, input: CallbackInput, eventType: CallbackValidation["eventType"]): CallbackValidation {
  const c = cfg(record);
  const secret = asString(c, "callbackSecret") || asString(c, "secret");
  if (!secret) {
    return { valid: false, reason: "No callback secret configured for this provider." };
  }

  // Token in query/body header "x-400ques-token" or query `token`.
  const queryToken = String(input.query.token ?? input.query.callbackToken ?? "");
  const headerToken = headerOf(input.headers, "x-400ques-token") ?? "";
  const bodyToken = commonToken(input.rawBody);
  if (headerToken && headerToken !== "" && safeEqual(headerToken, secret)) {
    return { valid: true, eventType, providerReference: headerToken, metadata: { method: "header" } };
  }
  if (queryToken && safeEqual(queryToken, secret)) {
    return { valid: true, eventType, providerReference: queryToken, metadata: { method: "query" } };
  }
  if (bodyToken && safeEqual(bodyToken, secret)) {
    return { valid: true, eventType, providerReference: bodyToken, metadata: { method: "body" } };
  }

  // HMAC-SHA256 signature (shared secret signing the raw body).
  const sig = headerOf(input.headers, "x-400ques-signature") ?? "";
  if (sig && verifyHmac(secret, input.rawBody, sig)) {
    return { valid: true, eventType, providerReference: sig, metadata: { method: "hmac" } };
  }

  return { valid: false, reason: "Callback signature/token did not match provider secret." };
}

function headerOf(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) return String(raw[0] ?? "");
  return typeof raw === "string" ? raw : undefined;
}

// Attempt to read a `token`/`secret` field from a JSON callback body.
function commonToken(rawBody: string): string {
  try {
    const parsed = JSON.parse(rawBody) as Record<string, unknown>;
    for (const k of ["token", "secret", "callbackToken"]) {
      const v = parsed[k];
      if (typeof v === "string" && v) return v;
    }
  } catch {
    /* not JSON — ignore */
  }
  return "";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function verifyHmac(secret: string, body: string, signature: string): boolean {
  try {
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    return safeEqual(expected.toLowerCase(), signature.toLowerCase());
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

// ── Registry lookup ───────────────────────────────────────────────
const REGISTRY: Record<AdProviderType, AdAdapter> = {
  SCRIPT: scriptAdapter,
  DIRECT_LINK: directLinkAdapter,
  REDIRECT: redirectAdapter,
  SNIPPET: snippetAdapter,
  API: apiAdapter,
  CPA: cpaAdapter,
  VERIFICATION: verificationAdapter,
  OTHER: otherAdapter,
};

export function getAdapter(type: string): AdAdapter {
  const normalized = (type || "OTHER").toUpperCase() as AdProviderType;
  return REGISTRY[normalized] ?? otherAdapter;
}

export function isKnownType(type: string): boolean {
  return getAdapter(type).type === (type || "OTHER").toUpperCase();
}

export function supportedTypes(): AdProviderType[] {
  return Object.keys(REGISTRY) as AdProviderType[];
}

// Placement eligibility: a provider serves a placement if it lists the
// placement in `placements` OR lists no placements (suggesting global use).
export function providerServesPlacement(record: AdProviderRecord, placement: string): boolean {
  if (!record.placements) return true;
  const list: unknown = record.placements;
  if (Array.isArray(list)) {
    const strings = list.filter((x): x is string => typeof x === "string" && x !== "");
    if (strings.length === 0) return true;
    return strings.includes(placement);
  }
  return true;
}
