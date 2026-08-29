"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiUrl } from "@/lib/api";

type AdRender = {
  html?: string;
  url?: string;
  redirect?: boolean;
  label?: string;
  meta?: Record<string, unknown>;
};

type AdItem = {
  providerId: string;
  placement: string;
  render: AdRender;
};

type ServeResult = {
  items: AdItem[];
  enabled: boolean;
};

// Module-scoped idempotency ids (persist across renders on the client).
const idMap = new Map<string, string>();

/**
 * Provider-agnostic ad placement.
 *
 * Fetches whatever the placement endpoint returns for the configured
 * providers and renders it (HTML snippet, sponsor link, or redirect).
 * Reports one idempotent IMPRESSION and tracks CLICKs back to the API.
 * Never receives or exposes any provider credentials/configuration.
 */
export function AdPlacement({ placement, className }: { placement: string; className?: string }) {
  const [served, setServed] = useState<ServeResult | null>(null);
  const reported = useRef(false);

  const impressionId = useMemo(() => {
    if (typeof window === "undefined") return "";
    if (!idMap.has(placement)) {
      idMap.set(placement, `${placement}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    }
    return idMap.get(placement) ?? "";
  }, [placement]);

  useEffect(() => {
    let active = true;
    fetch(apiUrl(`/api/public/ads/placement/${encodeURIComponent(placement)}`), { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ data: ServeResult }>) : null))
      .then((payload) => {
        if (!active) return;
        setServed(payload?.data ?? { items: [], enabled: false });
      })
      .catch(() => {
        if (active) setServed({ items: [], enabled: false });
      });
    return () => {
      active = false;
    };
  }, [placement]);

  // Record a single idempotent impression for the first served unit.
  useEffect(() => {
    if (!served || reported.current) return;
    const first = served.items[0];
    if (!first) return;
    reported.current = true;
    void apiFetch("/api/public/ads/events", {
      method: "POST",
      body: { providerId: first.providerId, placement: first.placement, type: "IMPRESSION", eventId: impressionId },
    }).catch(() => undefined);
  }, [served, impressionId]);

  if (!served || !served.enabled || served.items.length === 0) return null;

  return (
    <div className={className} data-placement={placement}>
      {served.items.map((item) => (
        <AdUnit key={item.providerId} item={item} placement={placement} />
      ))}
    </div>
  );
}

function AdUnit({ item, placement }: { item: AdItem; placement: string }) {
  const clickId = useMemo(
    () => `${placement}-${item.providerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [placement, item.providerId]
  );

  function onClick() {
    void apiFetch("/api/public/ads/events", {
      method: "POST",
      body: { providerId: item.providerId, placement: item.placement, type: "CLICK", eventId: clickId },
    }).catch(() => undefined);
  }

  if (item.render.html) {
    return (
      <a
        href={item.render.url ?? undefined}
        onClick={onClick}
        className="block"
        aria-label={item.render.label ?? "Sponsored content"}
        data-ad-provider={item.providerId}
      >
        <span
          className="block"
          dangerouslySetInnerHTML={{ __html: item.render.html }}
        />
      </a>
    );
  }

  if (item.render.url) {
    return (
      <a
        href={item.render.url}
        onClick={onClick}
        className="ad-adunit block w-full rounded-xl border border-line bg-white p-4 text-center text-sm font-medium text-foreground hover:bg-surface"
        data-ad-provider={item.providerId}
      >
        {item.render.label ?? "Visit sponsor"}
      </a>
    );
  }

  return null;
}
