"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
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
  Activity,
  BarChart3,
  Wallet,
} from "lucide-react";
import { getDashboardStats, getRevenueSnapshot, getDashboardOps, type DashboardStats, type RevenueSnapshot, type OpsData } from "@/lib/admin/dashboard";
import { getUnreadNotificationCount } from "@/lib/admin/system";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";

const TYPE_ICONS: Record<string, typeof Sparkles> = {
  contribution: Sparkles,
  report: ShieldAlert,
  category_request: FolderPlus,
  contact: Mail,
};

export default function AdminDashboardPage() {
  const query = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => getDashboardStats(),
    refetchInterval: 60_000,
  });

  const unread = useQuery<{ count: number }>({
    queryKey: ["admin-notifications-unread"],
    queryFn: () => getUnreadNotificationCount(),
    refetchInterval: 60_000,
  });

  const ops = useQuery<OpsData>({
    queryKey: ["admin-dashboard-ops"],
    queryFn: () => getDashboardOps(),
    refetchInterval: 60_000,
  });

  const revenue = useQuery<RevenueSnapshot>({
    queryKey: ["admin-dashboard-revenue"],
    queryFn: () => getRevenueSnapshot(),
    refetchInterval: 300_000,
  });

  const t = query.data?.totals;

  const statCards = [
    { label: "Categories", value: t?.categories ?? 0, icon: FolderOpen, href: "/back/stage/admin/categories", accent: "green" },
    { label: "Questions", value: t?.questions ?? 0, icon: HelpCircle, href: "/back/stage/admin/questions", accent: "orange" },
    { label: "Active Sessions", value: t?.activeSessions ?? 0, icon: PlayCircle, href: "/back/stage/admin/whatsapp", accent: "green" },
    { label: "Sessions Played", value: t?.completedSessions ?? 0, icon: MessageSquare, href: "/back/stage/admin/whatsapp", accent: "purple" },
    { label: "Moves Played", value: t?.moves ?? 0, icon: PlayCircle, href: "/back/stage/admin/whatsapp", accent: "brand" },
    { label: "Pending Questions", value: t?.pendingQuestions ?? 0, icon: Clock, href: "/back/stage/admin/questions", accent: "orange" },
    { label: "Pending Contributions", value: t?.pendingContributions ?? 0, icon: Sparkles, href: "/back/stage/admin/contributions", accent: "green" },
  ];

  const attentionLinks = [
    { label: "Pending questions", value: t?.pendingQuestions ?? 0, icon: Clock, href: "/back/stage/admin/questions", color: "bg-amber-100 text-amber-700" },
    { label: "Pending contributions", value: t?.pendingContributions ?? 0, icon: Sparkles, href: "/back/stage/admin/contributions", color: "bg-brand/10 text-brand-700" },
    { label: "Open reports", value: t?.openReports ?? 0, icon: ShieldAlert, href: "/back/stage/admin/reports", color: "bg-red-100 text-red-700" },
    { label: "Pending category requests", value: t?.pendingCategoryRequests ?? 0, icon: FolderPlus, href: "/back/stage/admin/category-requests", color: "bg-accent/10 text-accent-700" },
    { label: "Contact messages", value: t?.contactMessages ?? 0, icon: Mail, href: "/back/stage/admin/contact", color: "bg-purple-100 text-purple-700" },
    { label: "Unread notifications", value: unread.data?.count ?? 0, icon: Bell, href: "/back/stage/admin/notifications", color: "bg-blue-100 text-blue-700" },
  ];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your 400faqs instance</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={unread.data && unread.data.count > 0 ? "font-semibold text-brand" : ""}>
            {unread.data && unread.data.count > 0 ? `${unread.data.count} unread` : "No unread notifications"}
          </span>
          <Link href="/back/stage/admin/analytics">
            <Button variant="outline" size="sm">
              <BarChart3 className="mr-2 h-4 w-4" /> View Analytics
            </Button>
          </Link>
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

      {/* Revenue quick stats (trailing 30d) */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Est. revenue (30d)", value: revenue.data?.totals.estimated ?? null, href: "/admin/analytics" },
          { label: "Confirmed revenue (30d)", value: revenue.data?.totals.confirmed ?? null, href: "/admin/analytics" },
          { label: "Revenue total", value: revenue.data?.totals.total ?? null, href: "/admin/analytics" },
          { label: "Paid", value: revenue.data?.totals.paid ?? null, href: "/admin/analytics" },
        ].map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-colors hover:border-brand/30">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                </div>
                {revenue.isLoading ? (
                  <Skeleton className="h-6 w-16" />
                ) : s.value !== null ? (
                  <p className="text-xl font-bold">${s.value.toLocaleString(undefined, { maximumFractionDigits: s.value < 100 ? 2 : 0 })}</p>
                ) : (
                  <p className="text-xl font-bold text-muted-foreground">—</p>
                )}
              </CardContent>
            </Card>
          </Link>
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

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Background queues
            </CardTitle>
            {ops.isLoading && <Skeleton className="h-5 w-20" />}
          </CardHeader>
          <CardContent>
            {!ops.isLoading && (
              <div className="space-y-2">
                {Object.entries(ops.data?.queues ?? {}).map(([name, q]) => (
                  <div key={name} className="flex items-center justify-between rounded-xl border border-line px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold capitalize">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.waiting} waiting · {q.active} active · {q.delayed} delayed
                      </p>
                    </div>
                    {q.failed > 0 ? <Badge variant="red">{q.failed} failed</Badge> : <Badge variant="green">ok</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent system events</CardTitle>
          </CardHeader>
          <CardContent>
            {ops.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-xl" />
                ))}
              </div>
            ) : (ops.data?.recentEvents?.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No system events.</p>
            ) : (
              <div className="space-y-2">
                {ops.data?.recentEvents.slice(0, 6).map((e) => (
                  <div key={e.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.status === "ok" ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.message}</p>
                      <p className="text-xs text-muted-foreground">{e.component}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(e.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
