import { prisma } from "../../lib/prisma";
import { getMonetizationSettings } from "../monetization";
import {
  type AdProviderRecord,
  type PlacementServeResult,
} from "./types";
import { getAdapter, supportedTypes } from "./registry";
import { recordEvent } from "../monetization";

// ============================================================
// Placement ad serving.
//
// Publically serves configured ads for a placement by asking the
// provider adapter for the right payload — never by branching on a
// specific vendor in the application. Serving is driven by the
// AdPlacement table: an enabled placement assigned to an enabled,
// non-archived provider.
// ============================================================

function toRecord(row: {
  id: string;
  name: string;
  type: string;
  description: string | null;
  enabled: boolean;
  archived: boolean;
  priority: number;
  configuration: unknown;
  placements: unknown;
}): AdProviderRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    enabled: row.enabled,
    archived: row.archived,
    priority: row.priority,
    configuration: row.configuration as AdProviderRecord["configuration"],
    placements: row.placements as AdProviderRecord["placements"],
  };
}

/**
 * Serve ad units for a given placement (via the AdPlacement table).
 * Honors:
 *  - global monetization.enabled switch
 *  - placement enabled/priority and its assigned provider state
 *  - priority/random rotation strategy
 * Returns public-safe render results (never credentials).
 */
export async function servePlacement(placement: string, limit = 2): Promise<PlacementServeResult> {
  const settings = await getMonetizationSettings();
  if (!settings.enabled) return { items: [], enabled: false };

  const rows = await prisma.adPlacement.findMany({
    where: { key: placement, enabled: true, provider: { is: { enabled: true, archived: false } } },
    include: { provider: true },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
  });

  let ordered = rows;
  if (settings.rotation === "random") {
    ordered = [...rows].sort(() => Math.random() - 0.5);
  }

  const items: PlacementServeResult["items"] = [];
  for (const row of ordered) {
    if (items.length >= limit) break;
    const provider = row.provider;
    if (!provider) continue;
    const adapter = getAdapter(provider.type);
    const render = await adapter.render(toRecord(provider), placement, {
      providerPlacementId: row.providerPlacementId,
      format: row.format,
    });
    if (!render) continue;
    items.push({
      providerId: provider.id,
      placement,
      providerPlacementId: row.providerPlacementId,
      format: row.format,
      render,
    });
    await recordEvent("IMPRESSION", {
      providerId: provider.id,
      placement,
    });
  }

  return { items, enabled: true };
}

// Convenience: which provider types are available for the admin UI.
export function listSupportedProviderTypes(): string[] {
  return supportedTypes();
}

export type { AdProviderRecord, PlacementServeResult };
