"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FolderOpen, HelpCircle, Home, MessageCirclePlus, Menu, ShieldQuestion, Trophy, X, Flag, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/app", label: "Dashboard", icon: Home },
  { href: "/app/categories", label: "Categories", icon: FolderOpen },
  { href: "/app/contributions", label: "My Questions", icon: ShieldQuestion },
  { href: "/app/reports", label: "Reports", icon: Flag },
  { href: "/app/requests", label: "Requests", icon: FolderPlus },
  { href: "/app/contribute", label: "Contribute", icon: MessageCirclePlus },
  { href: "/app/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/app/help", label: "Help", icon: HelpCircle },
];

export function AppHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/app" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-brand text-sm font-extrabold text-white">
            4Q
          </span>
          <span className="font-extrabold tracking-tight">
            400QUES <span className="font-semibold text-muted-foreground">App</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(l.href) ? "bg-brand text-white" : "text-muted-foreground hover:bg-surface hover:text-ink"
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <nav className="space-y-1 border-t border-line bg-white px-4 py-3 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium",
                isActive(l.href) ? "bg-brand text-white" : "text-muted-foreground hover:bg-surface hover:text-ink"
              )}
            >
              <l.icon className="h-4 w-4" /> {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}