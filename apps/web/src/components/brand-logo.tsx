"use client";

import { apiUrl } from "@/lib/api";

type BrandLogoProps = {
  /** Resolved public settings map (Record<string,string>). */
  settings?: Record<string, string> | null;
  /** Control the size of the mark / wordmark. */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const MARK = { sm: "h-8 w-8 text-sm", md: "h-9 w-9 text-base", lg: "h-12 w-12 text-xl" } as const;
const TEXT = { sm: "text-base", md: "text-lg", lg: "text-2xl" } as const;

/**
 * Dynamic brand logo/mark. When `site.logo` (an image URL, typically an admin
 * upload) is configured it is shown; otherwise a clean gradient text mark is
 * used. Cloaks a broken image so the UI never shows a broken-image icon.
 */
export function BrandMark({ settings, size = "sm", className }: BrandLogoProps) {
  const logo = settings?.["site.logo_blob"] === "1" ? apiUrl("/api/logo") : settings?.["site.logo"]?.trim();

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        className={`${className ?? ""} h-8 w-auto shrink-0 rounded-lg object-contain`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div
      className={`${MARK[size]} flex shrink-0 items-center justify-center rounded-lg bg-gradient-brand font-black text-white ${className ?? ""}`}
      aria-hidden
    >
      <span className="drop-shadow-sm">4Q</span>
    </div>
  );
}

/**
 * Logo + app-name lockup used in the header and footer. The name always comes
 * from admin branding (`site.name`) with a neutral fallback.
 */
export function BrandLockup({ settings, size = "sm", className }: BrandLogoProps) {
  const name = settings?.["site.name"]?.trim() ?? "400faqs";
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <BrandMark settings={settings} size={size} />
      <span className={`${TEXT[size]} font-bold tracking-tight`}>{name}</span>
    </span>
  );
}
