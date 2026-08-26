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
  Users,
  Award,
  Megaphone,
  Bell,
  History,
  MessageCircle,
  Mail,
  ShieldCheck,
  Settings,
  LogOut,
} from "lucide-react";
import { getToken, clearToken, getAdminUser } from "@/lib/api";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Content",
    items: [
      { href: "/admin/categories", label: "Categories", icon: FolderOpen },
      { href: "/admin/questions", label: "Questions", icon: HelpCircle },
      { href: "/admin/faqs", label: "FAQs", icon: Star },
      { href: "/admin/articles", label: "Help Articles", icon: BookOpen },
      { href: "/admin/ads", label: "Ads", icon: Megaphone },
      { href: "/admin/badges", label: "Badges", icon: Award },
    ],
  },
  {
    label: "Review",
    items: [
      { href: "/admin/contributions", label: "Contributions", icon: Sparkles },
      { href: "/admin/reports", label: "Reports", icon: ShieldAlert },
      { href: "/admin/category-requests", label: "Category Requests", icon: FolderPlus },
      { href: "/admin/contact", label: "Contact Messages", icon: Mail },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/audit", label: "Audit Log", icon: History },
      { href: "/admin/admins", label: "Admins", icon: ShieldCheck },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!getToken()) {
      router.replace("/admin/login");
    }
  }, [router]);

  if (!mounted || !getToken()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  const admin = getAdminUser();

  const logout = () => {
    clearToken();
    router.replace("/admin/login");
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-line px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand text-sm font-black text-white">4Q</div>
          <div>
            <p className="text-sm font-bold leading-tight">400QUES</p>
            <p className="text-xs text-muted-foreground">Admin Panel</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-4">
          <Link
            href="/admin"
            className={cn(
              "mb-4 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
              pathname === "/admin" ? "bg-brand/10 text-brand-700" : "text-muted-foreground hover:bg-surface"
            )}
          >
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname.startsWith(item.href);
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
      </aside>

      <main className="flex-1 px-4 py-8 sm:px-6 lg:ml-64 lg:px-10">{children}</main>
    </div>
  );
}
