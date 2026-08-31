"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, MessageCircle, Search } from "lucide-react";
import { Container } from "./container";
import { BrandLockup } from "@/components/brand-logo";
import { usePublicSettings, useWhatsAppLink } from "@/hooks/use-public-settings";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/categories", label: "Categories" },
  { href: "/contribute", label: "Contribute" },
  { href: "/help", label: "Help" },
  { href: "/about", label: "About" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { data: settings } = usePublicSettings();
  const waLink = useWhatsAppLink("START");

  return (
    // Full-width header bar: touches the top, left and right edges. Not a
    // floating box. Only the content is constrained by the container.
    <header className="sticky top-0 z-50 w-full border-b border-line bg-white/90 backdrop-blur-xl">
      <Container>
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex shrink-0 items-center" aria-label="Home">
            <BrandLockup settings={settings} size="sm" />
          </Link>

          {/* Desktop primary nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-control px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right action group — Search sits where the old Admin button was */}
          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/search"
              className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-transparent px-3 text-xs font-medium text-ink transition-all hover:bg-surface"
            >
              <Search className="h-4 w-4" />
              Search
            </Link>
            {waLink !== "#" && (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-control bg-primary px-3 text-xs font-medium text-white shadow-soft transition-all hover:bg-primary-600 active:scale-[0.98]"
              >
                <MessageCircle className="h-4 w-4" /> Start Playing
              </a>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="rounded-control p-2 text-ink transition-colors hover:bg-surface md:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </Container>

      {/* Mobile navigation */}
      <div
        className={cn(
          "overflow-hidden border-t border-line bg-white md:hidden",
          open ? "max-h-[480px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <Container>
          <nav className="flex flex-col py-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-control px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/search"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-control px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface"
            >
              <Search className="h-4 w-4" /> Search
            </Link>
            {waLink !== "#" && (
              <div className="mt-2 flex gap-2 border-t border-line px-1 pt-3 pb-1">
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-control bg-primary px-4 py-2 text-sm font-medium text-white shadow-soft transition-all hover:bg-primary-600 active:scale-[0.98]"
                >
                  <MessageCircle className="h-4 w-4" /> Start Playing
                </a>
              </div>
            )}
          </nav>
        </Container>
      </div>
    </header>
  );
}
