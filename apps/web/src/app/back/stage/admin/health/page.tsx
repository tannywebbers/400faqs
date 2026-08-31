"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Radio, Server, Webhook, MessageCircle, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { timeAgo, formatNumber, cn } from "@/lib/utils";

type ServiceStatus = { status: string; message: string };

type HealthData = {
  server: ServiceStatus;
  whatsapp: ServiceStatus;
  database: ServiceStatus;
  redis: ServiceStatus;
  webhook: ServiceStatus;
  version: string;
  lastDeployment: string;
  platform: string;
  uptimeSeconds: number;
  queues: Record<string, { waiting: number; active: number; completed: number; failed: number; delayed: number; paused: number }>;
};

type SystemEvent = { id: string; component: string; status: string; message: string; createdAt: string };

type HealthCounts = {
  users: number;
  categories: number;
  questions: number;
  pendingQuestions: number;
  contributions: number;
  pendingContributions: number;
  sessions: number;
  activeSessions: number;
  openReports: number;
  pendingRequests: number;
  pendingNotifications: number;
};

const SERVICE_ICONS = { server: Server, whatsapp: MessageCircle, database: Database, redis: Radio, webhook: Webhook };

type OverallState = "CHECKING" | "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "ERROR";

const OVERALL_META: Record<OverallState, { label: string; variant: "green" | "orange" | "red" | "gray"; Icon: typeof Loader2; detail: string }> = {
  CHECKING: { label: "Checking…", variant: "gray", Icon: Loader2, detail: "Gathering component and queue status." },
  HEALTHY: { label: "All systems operational", variant: "green", Icon: CheckCircle2, detail: "Every monitored component and background queue is healthy." },
  DEGRADED: { label: "Degraded", variant: "orange", Icon: AlertTriangle, detail: "Some components or queues need attention, but the platform remains usable." },
  UNHEALTHY: { label: "Unhealthy", variant: "red", Icon: XCircle, detail: "One or more critical components are down." },
  ERROR: { label: "Status unavailable", variant: "red", Icon: XCircle, detail: "Could not retrieve health data. Check the API logs." },
};

export default function AdminHealthPage() {
  const token = getToken();

  const health = useQuery<HealthData>({
    queryKey: ["admin-health"],
    queryFn: () => apiFetch("/api/admin/health", { token }),
    refetchInterval: 60_000,
  });
  const events = useQuery<{ events: SystemEvent[]; unhealthy: number }>({
    queryKey: ["admin-system-events"],
    queryFn: () => apiFetch("/api/admin/health/system-events?limit=20", { token }),
    refetchInterval: 60_000,
  });
  const counts = useQuery<HealthCounts>({
    queryKey: ["admin-health-counts"],
    queryFn: () => apiFetch("/api/admin/health/counts", { token }),
    refetchInterval: 60_000,
  });

  // Frontend watchdog: if a health request hasn't settled within 15s, surface an
  // explicit ERROR state instead of staying on "Checking…" indefinitely.
  const [watchdog, setWatchdog] = useState(false);
  useEffect(() => {
    setWatchdog(false);
    if (health.isPending || health.isFetching) {
      const t = setTimeout(() => setWatchdog(true), 15_000);
      return () => clearTimeout(t);
    }
  }, [health.isPending, health.isFetching, health.dataUpdatedAt]);

  const services: { key: keyof typeof SERVICE_ICONS; label: string }[] = [
    { key: "server", label: "API server" },
    { key: "database", label: "Database" },
    { key: "redis", label: "Redis" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "webhook", label: "Webhook" },
  ];

  function computeState(): OverallState {
    if (watchdog || health.isError) return "ERROR";
    if (health.isPending || !health.data) return "CHECKING";
    const down = services.filter(({ key }) => health.data![key].status !== "operational");
    const queueIssues = Object.values(health.data!.queues ?? {}).some((q) => q.waiting < 0 || q.failed > 0);
    if (down.some(({ key }) => key === "database" || key === "redis")) return "UNHEALTHY";
    if (down.length > 0 || queueIssues) return "DEGRADED";
    return "HEALTHY";
  }

  const overall = computeState();
  const meta = OVERALL_META[overall];
  const uptime = health.data ? Math.floor(health.data.uptimeSeconds / 60) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">System Status</h1>
        <p className="text-sm text-muted-foreground">
          Live status{health.data ? ` · v${health.data.version} · ${health.data.platform} · up ${uptime}m` : ""}
        </p>
      </div>

      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-line bg-white p-4">
        <span className={cn("flex h-11 w-11 items-center justify-center rounded-xl", overall === "HEALTHY" ? "bg-emerald-100 text-emerald-600" : overall === "DEGRADED" ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600")}>
          {overall === "CHECKING" ? <Loader2 className="h-5 w-5 animate-spin" /> : <meta.Icon className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{meta.label}</p>
          <p className="text-xs text-muted-foreground">{meta.detail}</p>
        </div>
        <Badge variant={meta.variant}>{overall}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {services.map(({ key, label }) => {
          const Icon = SERVICE_ICONS[key];
          const s = health.data?.[key];
          const ok = s?.status === "operational";
          return (
            <Card key={key} className={ok ? "" : "border-red-200"}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", ok ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <Badge variant={ok ? "green" : "red"}>{ok ? "OK" : overall === "ERROR" ? "unknown" : s?.status ?? "…"}</Badge>
                </div>
                <p className="mt-3 text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{s?.message ?? (overall === "ERROR" ? "Unavailable" : "Checking…")}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Background queues
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(health.data?.queues ?? {}).map(([name, q]) => {
                  const unhealthy = q.waiting < 0 || q.failed > 0;
                  return (
                    <div key={name} className={cn("flex items-center justify-between rounded-xl border border-line px-4 py-3", unhealthy && "border-red-200")}>
                      <div>
                        <p className="text-sm font-semibold capitalize">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          {q.waiting} waiting · {q.active} active · {q.delayed} delayed
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatNumber(q.completed)} done</span>
                        {q.failed > 0 ? (
                          <Badge variant="red">{q.failed} failed</Badge>
                        ) : (
                          <Badge variant="green">healthy</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Recent system events
              {events.data && events.data.unhealthy > 0 && <Badge variant="orange">{events.data.unhealthy} unhealthy</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {events.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : (events.data?.events?.length ?? 0) === 0 ? (
              <EmptyState title="No system events" description="Component status changes are recorded here." />
            ) : (
              <div className="space-y-2">
                {events.data?.events.slice(0, 12).map((e) => (
                  <div key={e.id} className="flex items-start gap-3 rounded-xl border border-line p-3">
                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", e.status === "ok" ? "bg-emerald-500" : "bg-red-500")} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{e.message}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.component} · {timeAgo(e.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Content at a glance</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: "Users", value: counts.data?.users },
            { label: "Categories", value: counts.data?.categories },
            { label: "Questions", value: counts.data?.questions },
            { label: "Pending questions", value: counts.data?.pendingQuestions },
            { label: "Contributions", value: counts.data?.contributions },
            { label: "Pending contributions", value: counts.data?.pendingContributions },
            { label: "Sessions", value: counts.data?.sessions },
            { label: "Active sessions", value: counts.data?.activeSessions },
            { label: "Open reports", value: counts.data?.openReports },
            { label: "Pending requests", value: counts.data?.pendingRequests },
            { label: "Queued notifications", value: counts.data?.pendingNotifications },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-surface p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-xl font-bold">{item.value ?? <Skeleton className="h-6 w-10" />}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}