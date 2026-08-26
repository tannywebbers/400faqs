"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Users,
  FolderOpen,
  HelpCircle,
  PlayCircle,
  MessageSquare,
  Sparkles,
  ShieldAlert,
  FolderPlus,
  Mail,
  Bell,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/utils";

type DashboardStats = {
  totals: {
    users: number;
    categories: number;
    questions: number;
    approvedQuestions: number;
    pendingQuestions: number;
    sessions: number;
    activeSessions: number;
    completedSessions: number;
    moves: number;
    contributions: number;
    pendingContributions: number;
    reports: number;
    openReports: number;
    categoryRequests: number;
    pendingCategoryRequests: number;
    contactMessages: number;
    ads: number;
  };
  today: { questions: number; sessions: number; contributions: number; users: number };
  recentActivity: { id: string; type: string; title: string; createdAt: string }[];
};

const TYPE_ICONS: Record<string, typeof Sparkles> = {
  contribution: Sparkles,
  report: ShieldAlert,
  category_request: FolderPlus,
  contact: Mail,
};

export default function AdminDashboardPage() {
  const token = getToken();

  const query = useQuery<DashboardStats>({
    queryKey: ["admin-dashboard"],
    queryFn: () => apiFetch("/api/admin/dashboard", { token }),
    refetchInterval: 60_000,
  });

  const unread = useQuery<{ count: number }>({
    queryKey: ["admin-notifications-unread"],
    queryFn: () => apiFetch("/api/admin/notifications/unread-count", { token }),
    refetchInterval: 60_000,
  });

  const t = query.data?.totals;

  const statCards = [
    { label: "Total Users", value: t?.users ?? 0, icon: Users, href: "/admin/users", accent: "brand" },
    { label: "Categories", value: t?.categories ?? 0, icon: FolderOpen, href: "/admin/categories", accent: "green" },
    { label: "Questions", value: t?.questions ?? 0, icon: HelpCircle, href: "/admin/questions", accent: "orange" },
    { label: "Active Sessions", value: t?.activeSessions ?? 0, icon: PlayCircle, href: "/admin/whatsapp", accent: "green" },
    { label: "Sessions Played", value: t?.completedSessions ?? 0, icon: MessageSquare, href: "/admin/whatsapp", accent: "purple" },
    { label: "Moves Played", value: t?.moves ?? 0, icon: PlayCircle, href: "/admin/whatsapp", accent: "brand" },
    { label: "Pending Questions", value: t?.pendingQuestions ?? 0, icon: Clock, href: "/admin/questions", accent: "orange" },
    { label: "Pending Contributions", value: t?.pendingContributions ?? 0, icon: Sparkles, href: "/admin/contributions", accent: "green" },
  ];

  const attentionLinks = [
    { label: "Pending questions", value: t?.pendingQuestions ?? 0, icon: Clock, href: "/admin/questions", color: "bg-amber-100 text-amber-700" },
    { label: "Pending contributions", value: t?.pendingContributions ?? 0, icon: Sparkles, href: "/admin/contributions", color: "bg-brand/10 text-brand-700" },
    { label: "Open reports", value: t?.openReports ?? 0, icon: ShieldAlert, href: "/admin/reports", color: "bg-red-100 text-red-700" },
    { label: "Pending category requests", value: t?.pendingCategoryRequests ?? 0, icon: FolderPlus, href: "/admin/category-requests", color: "bg-accent/10 text-accent-700" },
    { label: "Contact messages", value: t?.contactMessages ?? 0, icon: Mail, href: "/admin/contact", color: "bg-purple-100 text-purple-700" },
    { label: "Unread notifications", value: unread.data?.count ?? 0, icon: Bell, href: "/admin/notifications", color: "bg-blue-100 text-blue-700" },
  ];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your 400QUES instance</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={unread.data && unread.data.count > 0 ? "font-semibold text-brand" : ""}>
            {unread.data && unread.data.count > 0 ? `${unread.data.count} unread` : "No unread notifications"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Link key={s.label} href={s.href}>
            <StatCard title={s.label} value={s.value} icon={s.icon} accent={s.accent as "brand" | "green" | "orange" | "purple" | "red"} loading={query.isLoading} />
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(["questions", "sessions", "contributions", "users"] as const).map((key) => (
          <Card key={key}>
            <CardContent className="flex items-center justify-between p-4">
              <p className="text-sm text-muted-foreground">Today — {key}</p>
              <p className="text-xl font-bold">{query.data?.today?.[key] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {attentionLinks.map((l) => (
              <Link key={l.href + l.label} href={l.href} className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand/30">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${l.color}`}>
                  <l.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium">{l.label}</span>
                <span className="text-lg font-bold">{l.value}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {query.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : query.data?.recentActivity?.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              query.data?.recentActivity.map((a) => {
                const Icon = TYPE_ICONS[a.type] ?? CheckCircle2;
                return (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</p>
                    </div>
                    <Badge variant="gray">{a.type.replace("_", " ")}</Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
