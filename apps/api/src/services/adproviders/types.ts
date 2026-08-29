import type { Prisma } from "@prisma/client";

// ============================================================
// Provider-agnostic ad adapter types.
//
// 400QUES works with any ad network/source by describing them as
// one of a small set of generic provider "types". The application
// (game, contribution, website) only ever talks to the Adapter
// abstraction below; it never branches on a specific vendor.
// ============================================================

// The generic provider types the platform understands. New providers
// map onto one of these — no application-logic changes required.
export const AdProviderTypes = [
  "SCRIPT", // Inject a chunk of HTML/JS (drop-in tag or script).
  "DIRECT_LINK", // A straight sponsor/advertiser destination URL.
  "REDIRECT", // The user is (step-)redirected to an external destination.
  "SNIPPET", // A self-contained HTML snippet rendered inline.
  "API", // Ad content/instructions fetched from a provider API endpoint.
  "CPA", // Cost-per-action: drives a conversion/verification gate, then credits.
  "VERIFICATION", // Ad unit that unlocks a WhatsApp verification gate.
  "OTHER", // Anything else — payload passed through as configured.
] as const;

export type AdProviderType = (typeof AdProviderTypes)[number];

// Site placements. Free-form strings so new placements never require a
// schema/code change — a provider simply lists the placements it serves.
export const AdPlacements = [
  "GATE", // WhatsApp monetization/verification gate page.
  "HOME_INLINE", // Home page inline unit.
  "CATEGORY_PAGE", // Category detail page.
  "FAQ_BOTTOM", // FAQ / content bottom unit.
  "CONTRIBUTION_PAGE", // Anonymous contribution flow.
  "RESULT_PAGE", // Post-play result page.
] as const;

export type AdPlacement = (typeof AdPlacements)[number];

// Provider-facing event kinds routed through the adapter.
export const AdEventTypes = [
  "IMPRESSION", // Ad unit shown to a user.
  "CLICK", // User clicked the ad.
  "CONVERSION", // User completed a paid/signup action.
  "VERIFICATION", // User completed an in-app verification (CPA/VERIFICATION).
  "CALLBACK", // A provider postback/webhook arrived.
] as const;

export type AdEventType = (typeof AdEventTypes)[number];

// ------------------------------------------------------------------
// The DB row we read providers from. Kept minimal + share-shaped so the
// adapter layer is decoupled from the rest of Prisma.
// ------------------------------------------------------------------
export type AdProviderRecord = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  enabled: boolean;
  archived: boolean;
  priority: number;
  configuration: Prisma.JsonValue | null;
  placements: Prisma.JsonValue | null;
};

// ------------------------------------------------------------------
// Adapter interface.
//
// Every provider is described by this same contract. The engine just
// stores AdProviderRecord rows; the adapter knows how to turn a row into
// something renderable and how to react to events/callbacks.
// ------------------------------------------------------------------
export interface AdAdapter {
  readonly type: AdProviderType;
  // Build the public-safe payload a client renders for this provider at a
  // given placement. Never returns credentials/secrets.
  render(record: AdProviderRecord, placement: string, ctx?: PlacementContext): Promise<RenderResult | null>;
  // Validate an incoming callback/postback for this provider. `rawBody` is
  // the untouched request body; returns the claimed provider reference (if
  // any) that we re-attribute the event to.
  validateCallback(record: AdProviderRecord, input: CallbackInput): CallbackValidation;
  // Statically validate an adapter's configured fields (admin "test config").
  validateConfig(record: AdProviderRecord): { valid: boolean; errors: string[]; warnings: string[] };
}

export type RenderResult = {
  // Only ONE of these will be populated per type, so clients render simply.
  html?: string; // SCRIPT / SNIPPET / API that returns markup
  url?: string; // DIRECT_LINK / REDIRECT target
  redirect?: boolean; // REDIRECT: perform a full-page redirect
  label?: string; // Friendly CTA label
  meta?: Record<string, unknown>; // Extra, public-safe metadata
};

export type CallbackInput = {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
};

export type CallbackValidation = {
  valid: boolean;
  reason?: string;
  providerReference?: string;
  // Optional event the callback represents (defaults to CALLBACK).
  eventType?: AdEventType;
  metadata?: Record<string, unknown>;
};

// Result of selecting ads for a placement.
export type PlacementServeResult = {
  items: {
    providerId: string;
    placement: string;
    // Provider-specific placement/zone/destination id for this assignment,
    // when the placement carries one (e.g. a provider zone/slot id or a link).
    providerPlacementId: string | null;
    // Capability/format to serve (defaults to the provider's type).
    format: string | null;
    render: RenderResult;
  }[];
  enabled: boolean;
};

// Optional per-placement configuration handed to an adapter at render time.
// Lets a placement override the destination/zone/link for a DIRECT_LINK /
// REDIRECT / SCRIPT provider without changing the provider row.
export type PlacementContext = {
  providerPlacementId?: string | null;
  format?: string | null;
};

// Config validation summary.
export type ConfigCheckResult = { valid: boolean; errors: string[]; warnings: string[] };
