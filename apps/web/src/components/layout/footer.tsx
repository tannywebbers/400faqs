"use client";

import Link from "next/link";
import { Container } from "./container";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { Twitter, Instagram, Facebook, Youtube, MessageCircle } from "lucide-react";

const FOOTER_LINKS = [
  { href: "/categories", label: "Categories" },
  { href: "/contribute", label: "Contribute" },
  { href: "/report", label: "Report a Question" },
  { href: "/request-category", label: "Request a Category" },
];

const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/help", label: "Help Center" },
  { href: "/contact", label: "Contact" },
  { href: "/status", label: "System Status" },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export function Footer() {
  const { data: settings } = usePublicSettings();
  const siteName = settings?.["site.name"] ?? "400QUES";
  const version = settings?.["site.version"] ?? "1.0.0";
  const social = {
    twitter: settings?.["social.twitter"],
    instagram: settings?.["social.instagram"],
    facebook: settings?.["social.facebook"],
    youtube: settings?.["social.youtube"],
  };

  return (
    <footer className="mt-24 border-t border-line bg-white">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-brand text-sm font-black text-white">4Q</div>
              <span className="text-lg font-bold">{siteName}</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {settings?.["site.description"]?.slice(0, 140) ?? "The Ultimate WhatsApp Questions Game."}
            </p>
            <div className="mt-4 flex items-center gap-2">
              {social.twitter && (
                <a href={social.twitter} target="_blank" rel="noreferrer" aria-label="Twitter" className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-ink">
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              {social.instagram && (
                <a href={social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-ink">
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {social.facebook && (
                <a href={social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-ink">
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              {social.youtube && (
                <a href={social.youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-ink">
                  <Youtube className="h-4 w-4" />
                </a>
              )}
              {settings?.["whatsapp.number"] && (
                <a
                  href={`https://wa.me/${settings["whatsapp.number"].replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
                  className="rounded-lg p-2 text-muted-foreground hover:bg-surface hover:text-ink"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Play</h4>
            <ul className="mt-3 space-y-2">
              {FOOTER_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Company</h4>
            <ul className="mt-3 space-y-2">
              {COMPANY_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Legal</h4>
            <ul className="mt-3 space-y-2">
              {LEGAL_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {siteName}. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">Version {version}</p>
        </div>
      </Container>
    </footer>
  );
}
