"use client";

import Link from "next/link";
import { Container } from "./container";
import { BrandLockup } from "@/components/brand-logo";
import { usePublicSettings } from "@/hooks/use-public-settings";
import { Twitter, Instagram, Facebook, Youtube, MessageCircle } from "lucide-react";
import { whatsappLink } from "@/lib/utils";

const PLAY_LINKS = [
  { href: "/categories", label: "Categories" },
  { href: "/contribute", label: "Contribute" },
  { href: "/report", label: "Report a Question" },
  { href: "/request-category", label: "Request a Category" },
];

const COMPANY_LINKS = [
  { href: "/about", label: "About" },
  { href: "/help", label: "Help Center" },
  { href: "/contact", label: "Contact" },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
];

export function Footer() {
  const { data: settings } = usePublicSettings();
  const social = {
    twitter: settings?.["social.twitter"],
    instagram: settings?.["social.instagram"],
    facebook: settings?.["social.facebook"],
    youtube: settings?.["social.youtube"],
  };
  const wa = whatsappLink(settings?.["whatsapp.number"] ?? "", "");

  return (
    <footer className="mt-24 border-t border-line bg-white">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-4">
          {/* Brand: dynamic logo + app name */}
          <div>
            <BrandLockup settings={settings} size="md" />
            <div className="mt-4 flex items-center gap-2">
              {social.twitter && (
                <a href={social.twitter} target="_blank" rel="noreferrer" aria-label="Twitter" className="rounded-control p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-ink">
                  <Twitter className="h-4 w-4" />
                </a>
              )}
              {social.instagram && (
                <a href={social.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="rounded-control p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-ink">
                  <Instagram className="h-4 w-4" />
                </a>
              )}
              {social.facebook && (
                <a href={social.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className="rounded-control p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-ink">
                  <Facebook className="h-4 w-4" />
                </a>
              )}
              {social.youtube && (
                <a href={social.youtube} target="_blank" rel="noreferrer" aria-label="YouTube" className="rounded-control p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-ink">
                  <Youtube className="h-4 w-4" />
                </a>
              )}
              {wa !== "#" && (
                <a href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="rounded-control p-2 text-muted-foreground transition-colors hover:bg-surface hover:text-ink">
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold">Play</h4>
            <ul className="mt-3 space-y-2">
              {PLAY_LINKS.map((l) => (
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

        {/* Centered copyright */}
        <div className="mt-12 border-t border-line pt-6 text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {settings?.["site.name"] ?? "400faqs"}. All rights reserved.
          </p>
        </div>
      </Container>
    </footer>
  );
}
