"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, MessageCircle, Search } from "lucide-react";
import { Container } from "./container";
import { Button } from "@/components/ui/button";
import { usePublicSettings, useWhatsAppLink } from "@/hooks/use-public-settings";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/categories", label: "Categories" },
  { href: "/contribute", label: "Contribute" },
  { href: "/help", label: "Help" },
  { href: "/status", label: "Status" },
  { href: "/about", label: "About" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { data: settings } = usePublicSettings();
  const waLink = useWhatsAppLink("Hi! I want to play 400faqs");
  const siteName = settings?.["site.name"] ?? "400faqs";

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-4">
      <Container>
        <div className="glass-strong flex h-14 items-center justify-between rounded-2xl px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-sm font-black text-white">
              4Q
            </div>
            <span className="text-base font-bold tracking-tight">{siteName}</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/search"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-ink"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Link>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link href="/admin" className="text-sm font-medium text-muted-foreground hover:text-ink">
              Admin
            </Link>
            {waLink !== "#" && (
              <Button asChild size="sm" className="rounded-lg">
                <a href={waLink} target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" /> Start Playing
                </a>
              </Button>
            )}
          </div>

          <button
            className="rounded-lg p-2 text-ink md:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <div
          className={cn(
            "glass-strong mt-2 overflow-hidden rounded-2xl transition-all duration-200 md:hidden",
            open ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <nav className="flex flex-col p-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface"
              >
                {link.label}
              </Link>
            ))}
            <Link href="/search" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink hover:bg-surface">
              Search
            </Link>
            <div className="mt-2 flex gap-2 border-t border-line p-2">
              {waLink !== "#" && (
                <Button asChild size="sm" className="flex-1">
                  <a href={waLink} target="_blank" rel="noreferrer">
                    <MessageCircle className="h-4 w-4" /> Start Playing
                  </a>
                </Button>
              )}
              <Link href="/admin" className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  Admin
                </Button>
              </Link>
            </div>
          </nav>
        </div>
      </Container>
    </header>
  );
}
