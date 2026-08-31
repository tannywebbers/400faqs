"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  FolderOpen,
  HelpCircle,
  Sparkles,
  ShieldAlert,
  FolderPlus,
  Star,
  BookOpen,
  Bell,
  History,
  MessageCircle,
  Mail,
  ShieldCheck,
  Settings,
  LogOut,
  PlayCircle,
  CreditCard,
  BarChart3,
  Wallet,
  Menu,
  X,
  Activity,
  Hammer,
} from "lucide-react";
import { getToken, clearToken, getAdminUser } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/back/stage/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/back/stage/admin/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/back/stage/admin/revenue", label: "Revenue", icon: Wallet },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/back/stage/admin/categories", label: "Categories", icon: FolderOpen },
      { href: "/back/stage/admin/questions", label: "Questions", icon: HelpCircle },
      { href: "/back/stage/admin/faqs", label: "FAQs", icon: Star },
      { href: "/back/stage/admin/articles", label: "Help Articles", icon: BookOpen },
    ],
  },
  {
    label: "Review",
    items: [
      { href: "/back/stage/admin/contributions", label: "Contributions", icon: Sparkles },
      { href: "/back/stage/admin/reports", label: "Reports", icon: ShieldAlert },
      { href: "/back/stage/admin/category-requests", label: "Category Requests", icon: FolderPlus },
      { href: "/back/stage/admin/contact", label: "Contact Messages", icon: Mail },
    ],
  },
  {
    label: "WhatsApp",
    items: [
      { href: "/back/stage/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { href: "/back/stage/admin/sessions", label: "Sessions", icon: PlayCircle },
    ],
  },
  {
    label: "Monetization",
    items: [
      { href: "/back/stage/admin/monetization", label: "Monetization", icon: CreditCard },
      { href: "/back/stage/admin/ads", label: "Ad Providers", icon: Activity },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/back/stage/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/back/stage/admin/health", label: "System Status", icon: Activity },
      { href: "/back/stage/admin/jobs", label: "Jobs", icon: Hammer },
      { href: "/back/stage/admin/audit", label: "Activity Log", icon: History },
      { href: "/back/stage/admin/admins", label: "Admins", icon: ShieldCheck },
      { href: "/back/stage/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!getToken()) {
      router.replace("/back/stage/admin/login");
    }
  }, [router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isLoginPage = pathname === "/back/stage/admin/login";

  if (!mounted || !getToken()) {
    if (isLoginPage) {
      return <>{children}</>;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  const admin = getAdminUser();

  const logout = () => {
    clearToken();
    router.replace("/back/stage/admin/login");
  };

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const navContent = (
    <>
      <div className="flex h-16 items-center gap-2 border-b border-line px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand text-sm font-black text-white">4Q</div>
        <div>
          <p className="text-sm font-bold leading-tight">400faqs</p>
          <p className="text-xs text-muted-foreground">Admin Panel</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-brand/10 text-brand-700" : "text-muted-foreground hover:bg-surface"
                    )}
                  >
                    <item.icon className="h-4 w-4" /> {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-line p-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white">
            {admin?.name?.[0] ?? "A"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{admin?.name ?? "Admin"}</p>
            <p className="text-xs text-muted-foreground">{admin?.role ?? ""}</p>
          </div>
        </div>
        <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-2 text-sm font-medium text-red-600 hover:bg-red-50">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>
    </>
  );

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-white lg:flex">
        {navContent}
      </aside>

      {/* Mobile header */}
      <div className="fixed inset-x-0 top-0 z-50 flex h-14 items-center border-b border-line bg-white px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-ink hover:bg-surface"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="ml-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-xs font-black text-white">4Q</div>
          <span className="text-sm font-bold">400faqs Admin</span>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-line bg-white transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {navContent}
      </aside>

      {/* Main content */}
      <main className="flex-1 px-4 py-8 pt-20 sm:px-6 lg:ml-64 lg:px-10 lg:pt-8">{children}</main>
    </div>
  );
}
