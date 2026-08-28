"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  Download,
  Camera,
  Bot,
  TrendingUp,
  ListChecks,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  AreaChart,
  Area,
} from "recharts";
import { apiFetch, getToken, apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatNumber, formatDate, maskPhone } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── API response shapes ─────────────────────────────────────────

type Trend = { value: number; previous: number; changePct: number | null; direction: "up" | "down" | "flat" };

type OverviewResponse = {
  range: { start: string; end: string; days: number };
  kpis: Record<string, Trend>;
  categories: { active: number; total: number };
};

type AdminAnalytics = {
  start: string;
  end: string;
  days: number;
  totals: Record<string, number>;
  series: Array<{
    date: string;
    users: number;
    questions: number;
    sessions: number;
    moves: number;
    contributions: number;
    reports: number;
    categoryRequests: number;
    messages: number;
    revenueLedger: number;
    campaigns: number;
  }>;
};

type UserAnalyticsResponse = {
  totals: Record<string, number>;
  series: { date: string; newUsers: number; activeUsers: number; returning: number }[];
  platforms: { new: number; returning: number };
  top: {
    mostActive: { userId: string; phone: string; name: string | null; moves: number }[];
    topContributors: { userId: string | null; phone: string; name: string | null; count: number }[];
    mostAnswered: { userId: string; phone: string; name: string | null; answered: number }[];
    mostSessions: { userId: string; phone: string; name: string | null; sessions: number }[];
  };
};

type SessionAnalyticsResponse = {
  totals: Record<string, number>;
  series: { date: string; created: number; completed: number; abandoned: number }[];
  byCategory: { categoryId: string | null; name: string; count: number }[];
  byGameType: { gameType: string; count: number }[];
};

type QuestionAnalyticsResponse = {
  totals: Record<string, number>;
  difficulty: { difficulty: number; count: number }[];
  mostPlayed: { id: string; text: string; type: string; category: string; playsCount: number; reportCount: number; difficulty: number }[];
  leastPlayed: { id: string; text: string; type: string; category: string; playsCount: number }[];
  mostReported: { id: string; text: string; type: string; category: string; reportCount: number; playsCount: number }[];
  highestSkip: { id: string; text: string; type: string; category: string; skipped: number; answered: number }[];
};

type ContributionAnalyticsResponse = {
  totals: Record<string, number>;
  series: { date: string; submitted: number; approved: number; rejected: number; duplicates: number }[];
  byCategory: { categoryId: string; name: string; count: number }[];
  byType: { type: string; count: number }[];
  aiConfidence: { bucket: string; count: number }[];
  topContributors: { phone: string; count: number }[];
};

type AIAnalyticsResponse = {
  totalChecked: number;
  aiAvailable: number;
  fallbackCases: number;
  byClassification: { classification: string; count: number }[];
  duplicateCount: number;
  uniqueCount: number;
  reviewRequired: number;
  averageConfidence: number;
  averageScore: number;
  duplicateRejectionRate: number;
  confidenceDistribution: { bucket: string; count: number }[];
  examples: { id: string; text: string; classification: string; confidence: number; score: number; status: string; createdAt: string }[];
  costData: { available: false; note: string };
};

type WhatsAppAdvancedResponse = {
  totals: Record<string, number>;
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  byDay: { date: string; inbound: number; outbound: number }[];
  byHour: { hour: number; count: number }[];
  templates: { templateId: string | null; name: string; total: number; delivered: number; read: number; failed: number; successRate: number }[];
  interactive: { type: string; count: number }[];
};

type MonetizationAnalyticsResponse = {
  totals: Record<string, number> & { gatesPerRound: Record<string, number> };
  byProvider: { providerId: string | null; name: string; gates: number; verified: number; linkOpens: number; codeRequests: number; failed: number; verificationRate: number; estimatedRevenue: number }[];
  byEvent: Record<string, number>;
  series: { date: string; gates: number; verified: number }[];
  funnel: { step: string; label: string; count: number; conversionPct: number | null; dropoffPct: number | null; note?: string }[];
};

type RevenueAnalyticsResponse = {
  totals: Record<string, number>;
  byProvider: { providerId: string | null; name: string; estimated: number; confirmed: number; total: number }[];
  byCategory: { name: string; amount: number }[];
  byEventType: { eventType: string; amount: number; rows: number }[];
  series: { date: string; estimated: number; confirmed: number; total: number }[];
};

type CategoryStat = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  status: string;
  questionCount: number;
  playCount: number;
  sessions: number;
  completedSessions: number;
  avgTurns: number;
};

type CategoryRanking = {
  id: string;
  name: string;
  color: string;
  status: string;
  sessions: number;
  players: number;
  questionsAsked: number;
  contributions: number;
  reports: number;
  gates: number;
  verifiedGates: number;
  verificationRate: number;
  estimatedRevenue: number;
  playCount: number;
  questionCount: number;
};

type SnapshotRow = {
  id: string;
  date: string;
  totals: Record<string, number>;
  day: Record<string, number>;
};

// ── Shared helpers ──────────────────────────────────────────────

const TAB_KEYS = ["overview", "users", "sessions", "content", "contributions", "ai", "whatsapp", "monetization", "revenue", "categories"] as const;

function TrendBadge({ t }: { t: Trend }) {
  if (t.changePct === null || t.changePct === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> n/a
      </span>
    );
  }
  const up = t.direction === "up";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", up ? "text-emerald-600" : "text-red-600")}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {t.changePct}%
    </span>
  );
}

function fmtMoney(n: number): string {
  return n < 1000 ? n.toFixed(2) : formatNumber(Math.round(n));
}

function MiniStat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-muted/30 p-3">
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function KpiGrid({ kpis, items }: { kpis: Record<string, Trend>; items: { key: string; label: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ key, label }) => (
        <Card key={key}>
          <CardContent className="flex flex-col gap-1 p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-2xl font-bold tracking-tight">{formatNumber(kpis[key]?.value ?? 0)}</p>
              <TrendBadge t={kpis[key] ?? { value: 0, previous: 0, changePct: null, direction: "flat" }} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-16" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function PhoneCell({ phone, name }: { phone: string; name: string | null }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{name || maskPhone(phone)}</p>
      {name && <p className="text-xs text-muted-foreground">{maskPhone(phone)}</p>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const token = getToken();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<(typeof TAB_KEYS)[number]>("overview");
  const [dataset, setDataset] = useState<string>("overview");
  const [activeKey, setActiveKey] = useState<string>("30d");

  const applyRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  };

  const applyCalendar = (label: string) => {
    const end = new Date();
    let start = new Date();
    if (label === "today") {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (label === "yesterday") {
      start.setDate(end.getDate() - 1);
    } else if (label === "this-month") {
      start.setDate(1);
    } else if (label === "last-month") {
      start.setDate(1);
      start.setMonth(start.getMonth() - 1);
      end.setDate(1);
      end.setDate(0); // last day of previous month
    } else if (label === "ytd") {
      start = new Date(end.getFullYear(), 0, 1);
    }
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setFrom(fmt(start));
    setTo(fmt(end));
  };

  const params = () => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  };

  // ── Queries (loaded lazily per active tab) ──
  const overviewQuery = useQuery<OverviewResponse>({
    queryKey: ["admin-analytics-overview", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/overview?${params()}`, { token }),
    enabled: tab === "overview",
    placeholderData: (prev) => prev,
  });

  const analyticsQuery = useQuery<AdminAnalytics>({
    queryKey: ["admin-analytics", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics?${params()}`, { token }),
    enabled: tab === "overview",
    placeholderData: (prev) => prev,
  });

  const usersQuery = useQuery<UserAnalyticsResponse>({
    queryKey: ["admin-analytics-users", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/users?${params()}`, { token }),
    enabled: tab === "users",
  });

  const sessionsQuery = useQuery<SessionAnalyticsResponse>({
    queryKey: ["admin-analytics-sessions", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/sessions?${params()}`, { token }),
    enabled: tab === "sessions",
  });

  const questionsQuery = useQuery<QuestionAnalyticsResponse>({
    queryKey: ["admin-analytics-question-advanced"],
    queryFn: () => apiFetch("/api/admin/analytics/questions/advanced", { token }),
    enabled: tab === "content",
  });

  const contributionsQuery = useQuery<ContributionAnalyticsResponse>({
    queryKey: ["admin-analytics-contributions", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/contributions?${params()}`, { token }),
    enabled: tab === "contributions",
  });

  const aiQuery = useQuery<AIAnalyticsResponse>({
    queryKey: ["admin-analytics-ai-advanced", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/ai/advanced?${params()}`, { token }),
    enabled: tab === "ai",
  });

  const whatsappQuery = useQuery<WhatsAppAdvancedResponse>({
    queryKey: ["admin-analytics-whatsapp-advanced", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/whatsapp/advanced?${params()}`, { token }),
    enabled: tab === "whatsapp",
  });

  const monetizationQuery = useQuery<MonetizationAnalyticsResponse>({
    queryKey: ["admin-analytics-monetization", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/monetization?${params()}`, { token }),
    enabled: tab === "monetization",
  });

  const revenueQuery = useQuery<RevenueAnalyticsResponse>({
    queryKey: ["admin-analytics-revenue", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/revenue?${params()}`, { token }),
    enabled: tab === "revenue",
  });

  const categoriesQuery = useQuery<CategoryStat[]>({
    queryKey: ["admin-analytics-categories"],
    queryFn: () => apiFetch("/api/admin/analytics/categories", { token }),
    enabled: tab === "categories" || tab === "overview",
  });

  const rankingsQuery = useQuery<CategoryRanking[]>({
    queryKey: ["admin-analytics-rankings"],
    queryFn: () => apiFetch("/api/admin/analytics/categories/rankings", { token }),
    enabled: tab === "categories",
  });

  const snapshotsQuery = useQuery<SnapshotRow[]>({
    queryKey: ["admin-analytics-snapshots"],
    queryFn: () => apiFetch("/api/admin/analytics/snapshots?days=120", { token }),
    enabled: tab === "overview",
  });

  const captureSnapshotMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/analytics/snapshots/capture", { method: "POST", token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-analytics-snapshots"] });
    },
  });

  const download = async (path: string, filename: string) => {
    const res = await fetch(apiUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const series = analyticsQuery.data?.series ?? [];
  const d = analyticsQuery.data;
  const snapshotSeries = (snapshotsQuery.data ?? []).map((s) => ({
    date: s.date,
    users: s.totals.users ?? 0,
    sessions: s.totals.sessions ?? 0,
    questions: s.totals.questions ?? 0,
    moves: s.totals.moves ?? 0,
  }));

  const presets: { key: string; label: string; run: () => void }[] = [
    { key: "today", label: "Today", run: () => applyCalendar("today") },
    { key: "yesterday", label: "Yesterday", run: () => applyCalendar("yesterday") },
    { key: "7d", label: "7d", run: () => applyRange(7) },
    { key: "14d", label: "14d", run: () => applyRange(14) },
    { key: "30d", label: "30d", run: () => applyRange(30) },
    { key: "60d", label: "60d", run: () => applyRange(60) },
    { key: "90d", label: "90d", run: () => applyRange(90) },
    { key: "this-month", label: "This month", run: () => applyCalendar("this-month") },
    { key: "last-month", label: "Last month", run: () => applyCalendar("last-month") },
    { key: "ytd", label: "YTD", run: () => applyCalendar("ytd") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">BI dashboard · users, sessions, content, monetization &amp; revenue</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dataset}
            onChange={(e) => setDataset(e.target.value)}
            className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink focus:outline-none"
            aria-label="Export dataset"
          >
            <option value="overview">Overview series</option>
            <option value="users">Users</option>
            <option value="sessions">Sessions</option>
            <option value="questions">Questions</option>
            <option value="contributions">Contributions</option>
            <option value="ai">AI screening</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="monetization">Monetization</option>
            <option value="revenue">Revenue ledger</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => download(`/api/admin/analytics/export?dataset=${dataset}&${params()}`, `analytics-${dataset}.csv`)}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Date range */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-2">
            <Input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="w-44" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {presets.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  p.run();
                  setActiveKey(p.key);
                }}
                className={cn(
                  "rounded-md px-2 py-1 transition-colors hover:bg-muted",
                  activeKey === p.key ? "bg-brand/10 font-semibold text-brand" : ""
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {overviewQuery.data && tab === "overview" && (
            <p className="text-sm text-muted-foreground xl:ml-auto">
              {formatDate(overviewQuery.data.range.start)} – {formatDate(overviewQuery.data.range.end)}
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TAB_KEYS)[number])}>
        <TabsList className="flex flex-wrap h-auto w-full justify-start overflow-x-auto rounded-xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="contributions">Contributions</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="monetization">Monetization</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="space-y-6">
          {overviewQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : (
            <KpiGrid
              kpis={overviewQuery.data?.kpis ?? {}}
              items={[
                { key: "totalUsers", label: "Total users" },
                { key: "activeUsers", label: "Active users" },
                { key: "newUsers", label: "New users" },
                { key: "totalSessions", label: "Sessions created" },
                { key: "completedSessions", label: "Completed" },
                { key: "abandonedSessions", label: "Abandoned" },
                { key: "questionsAsked", label: "Questions asked" },
                { key: "questionsAnswered", label: "Questions answered" },
                { key: "totalMoves", label: "Moves played" },
                { key: "verificationGates", label: "Verification gates" },
                { key: "verificationSuccessRate", label: "Verification success %" },
                { key: "contributions", label: "Contributions" },
                { key: "approvedContributions", label: "Approved contributions" },
                { key: "reportedQuestions", label: "Reported questions" },
                { key: "avgSessionSeconds", label: "Avg session (sec)" },
                { key: "avgRoundsPerSession", label: "Avg rounds / session" },
              ]}
            />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sessions · Moves · Users</CardTitle>
                <CardDescription>Daily volume over the selected range</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsQuery.isLoading ? (
                  <Skeleton className="h-72 w-full" />
                ) : series.length === 0 ? (
                  <EmptyState title="No data" description="No activity in this range." className="py-16" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="sessions" stroke="#2F80ED" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="moves" stroke="#F2994A" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="users" stroke="#27AE60" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Questions · Contributions</CardTitle>
                <CardDescription>Daily content production</CardDescription>
              </CardHeader>
              <CardContent>
                {analyticsQuery.isLoading ? (
                  <Skeleton className="h-72 w-full" />
                ) : series.length === 0 ? (
                  <EmptyState title="No data" description="No activity in this range." className="py-16" />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="questions" fill="#2F80ED" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="contributions" fill="#BB6BD9" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Snapshots comparison */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Camera className="h-4 w-4" /> Cumulative Snapshots</CardTitle>
                <CardDescription>Point-in-time totals captured daily for long-term trend comparison</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => captureSnapshotMutation.mutate()} disabled={captureSnapshotMutation.isPending}>
                <Camera className="mr-2 h-4 w-4" /> {captureSnapshotMutation.isPending ? "Capturing..." : "Capture Now"}
              </Button>
            </CardHeader>
            <CardContent>
              {snapshotsQuery.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : snapshotSeries.length < 2 ? (
                <EmptyState
                  title="No snapshots yet"
                  description="Snapshots are captured daily at 00:15. Trigger one manually above to begin the series."
                  className="py-12"
                />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={snapshotSeries} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="users" stroke="#27AE60" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="sessions" stroke="#2F80ED" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="questions" stroke="#F2994A" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="moves" stroke="#BB6BD9" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── USERS ── */}
        <TabsContent value="users" className="space-y-6">
          {usersQuery.data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MiniStat label="Total users" value={formatNumber(usersQuery.data.totals.totalUsers ?? 0)} />
              <MiniStat label="New in range" value={formatNumber(usersQuery.data.totals.newUsers ?? 0)} />
              <MiniStat label="Active" value={formatNumber(usersQuery.data.totals.activeUsers ?? 0)} />
              <MiniStat label="Returning" value={formatNumber(usersQuery.data.totals.returningUsers ?? 0)} />
              <MiniStat label="In sessions" value={formatNumber(usersQuery.data.totals.usersInSessions ?? 0)} />
              <MiniStat label="Contributing" value={formatNumber(usersQuery.data.totals.usersContributing ?? 0)} />
              <MiniStat label="Reporting" value={formatNumber(usersQuery.data.totals.usersReporting ?? 0)} />
              <MiniStat label="Requesting" value={formatNumber(usersQuery.data.totals.usersRequesting ?? 0)} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New vs active users per day</CardTitle>
            </CardHeader>
            <CardContent>
              {(usersQuery.data?.series ?? []).length === 0 ? (
                <EmptyState title="No data" className="py-12" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={usersQuery.data!.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="newUsers" stackId="1" stroke="#2F80ED" fill="#2F80ED" fillOpacity={0.15} />
                    <Area type="monotone" dataKey="activeUsers" stackId="1" stroke="#27AE60" fill="#27AE60" fillOpacity={0.15} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          {usersQuery.data && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Most active players</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>User</TableHead><TableHead className="text-right">Moves</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersQuery.data.top.mostActive.map((u) => (
                        <TableRow key={u.userId}>
                          <TableCell><PhoneCell phone={u.phone} name={u.name} /></TableCell>
                          <TableCell className="text-right">{u.moves}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top contributors</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>User</TableHead><TableHead className="text-right">Contributions</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersQuery.data.top.topContributors.map((u) => (
                        <TableRow key={u.userId ?? u.phone}>
                          <TableCell><PhoneCell phone={u.phone} name={u.name} /></TableCell>
                          <TableCell className="text-right">{u.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Most answered</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>User</TableHead><TableHead className="text-right">Answered</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersQuery.data.top.mostAnswered.map((u) => (
                        <TableRow key={u.userId}>
                          <TableCell><PhoneCell phone={u.phone} name={u.name} /></TableCell>
                          <TableCell className="text-right">{u.answered}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Most sessions</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>User</TableHead><TableHead className="text-right">Sessions</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersQuery.data.top.mostSessions.map((u) => (
                        <TableRow key={u.userId}>
                          <TableCell><PhoneCell phone={u.phone} name={u.name} /></TableCell>
                          <TableCell className="text-right">{u.sessions}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── SESSIONS ── */}
        <TabsContent value="sessions" className="space-y-6">
          {sessionsQuery.data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Created", value: sessionsQuery.data.totals.created ?? 0 },
                { label: "Joined", value: sessionsQuery.data.totals.joined ?? 0 },
                { label: "Completed", value: sessionsQuery.data.totals.completed ?? 0 },
                { label: "Cancelled", value: sessionsQuery.data.totals.cancelled ?? 0 },
                { label: "Expired", value: sessionsQuery.data.totals.expired ?? 0 },
                { label: "Abandoned", value: sessionsQuery.data.totals.abandoned ?? 0 },
                { label: "Active now", value: sessionsQuery.data.totals.activeNow ?? 0 },
                { label: "Completion %", value: sessionsQuery.data.totals.completionRate ?? 0, hint: "abandonment " + (sessionsQuery.data.totals.abandonmentRate ?? 0) + "%" },
                { label: "Avg duration (sec)", value: Math.round(sessionsQuery.data.totals.avgDurationSeconds ?? 0) },
                { label: "Avg moves", value: sessionsQuery.data.totals.avgMoves ?? 0 },
                { label: "Avg questions / session", value: sessionsQuery.data.totals.avgQuestionsPerSession ?? 0 },
              ].map((m) => (
                <MiniStat key={m.label} label={m.label} value={formatNumber(m.value)} hint={m.hint} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Created · Completed · Abandoned per day</CardTitle>
            </CardHeader>
            <CardContent>
              {(sessionsQuery.data?.series ?? []).length === 0 ? (
                <EmptyState title="No data" className="py-12" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={sessionsQuery.data!.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="created" stroke="#2F80ED" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="completed" stroke="#27AE60" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="abandoned" stroke="#EB5757" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">By category</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Category</TableHead><TableHead className="text-right">Sessions</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {(sessionsQuery.data?.byCategory ?? []).map((c) => (
                      <TableRow key={c.categoryId ?? "none"}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">By game type</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Game type</TableHead><TableHead className="text-right">Sessions</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {(sessionsQuery.data?.byGameType ?? []).map((g) => (
                      <TableRow key={g.gameType}>
                        <TableCell className="font-medium">{g.gameType}</TableCell>
                        <TableCell className="text-right">{g.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── CONTENT ── */}
        <TabsContent value="content" className="space-y-6">
          {questionsQuery.data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total questions", value: questionsQuery.data.totals.total ?? 0 },
                { label: "Approved", value: questionsQuery.data.totals.approved ?? 0 },
                { label: "Pending", value: questionsQuery.data.totals.pending ?? 0 },
                { label: "Rejected", value: questionsQuery.data.totals.rejected ?? 0 },
                { label: "TRUTH", value: questionsQuery.data.totals.truth ?? 0 },
                { label: "DARE", value: questionsQuery.data.totals.dare ?? 0 },
                { label: "Total plays", value: questionsQuery.data.totals.played ?? 0 },
                { label: "Reported", value: questionsQuery.data.totals.reported ?? 0 },
              ].map((m) => (
                <MiniStat key={m.label} label={m.label} value={formatNumber(m.value)} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}
          {(questionsQuery.data?.difficulty ?? []).length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Difficulty distribution (approved)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={questionsQuery.data!.difficulty} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="difficulty" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#2F80ED" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Most played</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Question</TableHead><TableHead className="text-right">Plays</TableHead><TableHead className="text-right">Reports</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(questionsQuery.data?.mostPlayed ?? []).map((q) => (
                      <TableRow key={q.id}>
                        <TableCell><p className="line-clamp-1 font-medium">{q.text}</p><p className="text-xs text-muted-foreground">{q.category}</p></TableCell>
                        <TableCell className="text-right">{q.playsCount}</TableCell>
                        <TableCell className="text-right">{q.reportCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Most reported</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Question</TableHead><TableHead className="text-right">Reports</TableHead><TableHead className="text-right">Plays</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(questionsQuery.data?.mostReported ?? []).map((q) => (
                      <TableRow key={q.id}>
                        <TableCell><p className="line-clamp-1 font-medium">{q.text}</p><p className="text-xs text-muted-foreground">{q.category}</p></TableCell>
                        <TableCell className="text-right">{q.reportCount}</TableCell>
                        <TableCell className="text-right">{q.playsCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Highest skip / unanswered</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Question</TableHead><TableHead className="text-right">Skipped</TableHead><TableHead className="text-right">Answered</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(questionsQuery.data?.highestSkip ?? []).map((q) => (
                      <TableRow key={q.id}>
                        <TableCell><p className="line-clamp-1 font-medium">{q.text}</p><p className="text-xs text-muted-foreground">{q.category}</p></TableCell>
                        <TableCell className="text-right">{q.skipped}</TableCell>
                        <TableCell className="text-right">{q.answered}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Least played</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Question</TableHead><TableHead className="text-right">Plays</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(questionsQuery.data?.leastPlayed ?? []).map((q) => (
                      <TableRow key={q.id}>
                        <TableCell><p className="line-clamp-1 font-medium">{q.text}</p><p className="text-xs text-muted-foreground">{q.category}</p></TableCell>
                        <TableCell className="text-right">{q.playsCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── CONTRIBUTIONS ── */}
        <TabsContent value="contributions" className="space-y-6">
          {contributionsQuery.data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Submitted", value: contributionsQuery.data.totals.submitted ?? 0 },
                { label: "Pending", value: contributionsQuery.data.totals.pending ?? 0 },
                { label: "Approved", value: contributionsQuery.data.totals.approved ?? 0 },
                { label: "Rejected", value: contributionsQuery.data.totals.rejected ?? 0 },
                { label: "Flagged", value: contributionsQuery.data.totals.flagged ?? 0 },
                { label: "Exact duplicates", value: contributionsQuery.data.totals.exactDuplicates ?? 0 },
                { label: "Very similar", value: contributionsQuery.data.totals.verySimilar ?? 0 },
                { label: "Unique", value: contributionsQuery.data.totals.unique ?? 0 },
                { label: "Approval rate", value: (contributionsQuery.data.totals.approvalRate ?? 0) + "%" },
                { label: "Rejection rate", value: (contributionsQuery.data.totals.rejectionRate ?? 0) + "%" },
                { label: "Duplicate rate", value: (contributionsQuery.data.totals.duplicateRate ?? 0) + "%" },
              ].map((m) => (
                <MiniStat key={m.label} label={m.label} value={m.value} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">Submitted · Approved · Rejected per day</CardTitle></CardHeader>
            <CardContent>
              {(contributionsQuery.data?.series ?? []).length === 0 ? (
                <EmptyState title="No data" className="py-12" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={contributionsQuery.data!.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="submitted" fill="#2F80ED" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="approved" fill="#27AE60" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="rejected" fill="#EB5757" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="duplicates" fill="#F2994A" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">By category</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Contributions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(contributionsQuery.data?.byCategory ?? []).map((c) => (
                      <TableRow key={c.categoryId}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">AI confidence buckets</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Confidence</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(contributionsQuery.data?.aiConfidence ?? []).map((b) => (
                      <TableRow key={b.bucket}>
                        <TableCell className="font-medium">{b.bucket}</TableCell>
                        <TableCell className="text-right">{b.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top contributors</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Phone</TableHead><TableHead className="text-right">Contributions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(contributionsQuery.data?.topContributors ?? []).map((u, i) => (
                      <TableRow key={u.phone + i}>
                        <TableCell className="font-medium">{maskPhone(u.phone)}</TableCell>
                        <TableCell className="text-right">{u.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">By type</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(contributionsQuery.data?.byType ?? []).map((t) => (
                      <TableRow key={t.type}>
                        <TableCell className="font-medium">{t.type}</TableCell>
                        <TableCell className="text-right">{t.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── AI & MODERATION ── */}
        <TabsContent value="ai" className="space-y-6">
          {aiQuery.data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total screened", value: aiQuery.data.totalChecked ?? 0 },
                { label: "AI available", value: aiQuery.data.aiAvailable ?? 0 },
                { label: "Fallback cases", value: aiQuery.data.fallbackCases ?? 0 },
                { label: "Duplicates found", value: aiQuery.data.duplicateCount ?? 0 },
                { label: "Unique", value: aiQuery.data.uniqueCount ?? 0 },
                { label: "Review required", value: aiQuery.data.reviewRequired ?? 0 },
                { label: "Avg confidence", value: (aiQuery.data.averageConfidence ?? 0).toFixed(2) },
                { label: "Avg score", value: (aiQuery.data.averageScore ?? 0).toFixed(2) },
                { label: "Duplicate rejection %", value: (aiQuery.data.duplicateRejectionRate ?? 0) + "%" },
              ].map((m) => (
                <MiniStat key={m.label} label={m.label} value={typeof m.value === "number" ? formatNumber(m.value) : m.value} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Classifications</CardTitle></CardHeader>
              <CardContent>
                {(aiQuery.data?.byClassification ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No AI screenings in range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={aiQuery.data!.byClassification.map((c) => ({ name: c.classification, count: c.count }))} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#BB6BD9" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> AI cost tracking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-white/50 px-6 py-10 text-center">
                  <Bot className="h-7 w-7 text-muted-foreground" />
                  <p className="text-sm font-semibold">{aiQuery.data?.costData.note ?? "AI COST DATA NOT AVAILABLE"}</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    No token/usage feed is recorded for Google-AI calls, so cost figures are never fabricated.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Examples</CardTitle><CardDescription>Recently screened non-trivial contributions</CardDescription></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Contribution</TableHead><TableHead>Classification</TableHead><TableHead className="text-right">Confidence</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(aiQuery.data?.examples ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell><p className="line-clamp-1 font-medium">{e.text}</p></TableCell>
                      <TableCell><Badge variant="purple">{e.classification}</Badge></TableCell>
                      <TableCell className="text-right">{e.confidence.toFixed(2)}</TableCell>
                      <TableCell><Badge variant="gray">{e.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WHATSAPP ── */}
        <TabsContent value="whatsapp" className="space-y-6">
          {whatsappQuery.data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Inbound", value: whatsappQuery.data.totals.inbound ?? 0 },
                { label: "Outbound", value: whatsappQuery.data.totals.outbound ?? 0 },
                { label: "Sent", value: whatsappQuery.data.totals.sent ?? 0 },
                { label: "Delivered", value: whatsappQuery.data.totals.delivered ?? 0 },
                { label: "Read", value: whatsappQuery.data.totals.read ?? 0 },
                { label: "Failed", value: whatsappQuery.data.totals.failed ?? 0 },
                { label: "Conversations", value: whatsappQuery.data.totals.conversations ?? 0 },
                { label: "Active users", value: whatsappQuery.data.totals.activeUsers ?? 0 },
              ].map((m) => (
                <MiniStat key={m.label} label={m.label} value={formatNumber(m.value)} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Daily volume</CardTitle></CardHeader>
              <CardContent>
                {(whatsappQuery.data?.byDay ?? []).length === 0 ? (
                  <EmptyState title="No data" className="py-12" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={whatsappQuery.data!.byDay} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="outbound" stackId="1" stroke="#2F80ED" fill="#2F80ED" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="inbound" stackId="1" stroke="#27AE60" fill="#27AE60" fillOpacity={0.15} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Hourly distribution</CardTitle><CardDescription>UTC, bounded to last 31 days</CardDescription></CardHeader>
              <CardContent>
                {(whatsappQuery.data?.byHour ?? []).length === 0 ? (
                  <EmptyState title="No data" className="py-12" />
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={whatsappQuery.data!.byHour} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#2F80ED" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Template performance</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Template</TableHead><TableHead className="text-right">Sent</TableHead><TableHead className="text-right">Delivered</TableHead><TableHead className="text-right">Read</TableHead><TableHead className="text-right">Failed</TableHead><TableHead className="text-right">Success %</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {(whatsappQuery.data?.templates ?? []).map((t) => (
                      <TableRow key={t.templateId ?? t.name}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-right">{t.total}</TableCell>
                        <TableCell className="text-right">{t.delivered}</TableCell>
                        <TableCell className="text-right">{t.read}</TableCell>
                        <TableCell className="text-right">{t.failed}</TableCell>
                        <TableCell className="text-right">{t.successRate}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Status &amp; type breakdown</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(whatsappQuery.data?.byType ?? []).map((t) => (
                      <TableRow key={t.type}>
                        <TableCell className="font-medium capitalize">{t.type}</TableCell>
                        <TableCell className="text-right">{t.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Table>
                  <TableHeader><TableRow><TableHead>Status</TableHead><TableHead className="text-right">Count</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(whatsappQuery.data?.byStatus ?? []).map((s) => (
                      <TableRow key={s.status}>
                        <TableCell className="font-medium capitalize">{s.status}</TableCell>
                        <TableCell className="text-right">{s.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── MONETIZATION ── */}
        <TabsContent value="monetization" className="space-y-6">
          {monetizationQuery.data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Total gates", value: monetizationQuery.data.totals.gates ?? 0 },
                { label: "Pending", value: monetizationQuery.data.totals.pending ?? 0 },
                { label: "Verified", value: monetizationQuery.data.totals.verified ?? 0 },
                { label: "Expired", value: monetizationQuery.data.totals.expired ?? 0 },
                { label: "Failed", value: monetizationQuery.data.totals.failed ?? 0 },
                { label: "Cancelled", value: monetizationQuery.data.totals.cancelled ?? 0 },
                { label: "Verification rate", value: (monetizationQuery.data.totals.verificationRate ?? 0) + "%" },
                { label: "Avg completion (sec)", value: Math.round(monetizationQuery.data.totals.averageCompletionSeconds ?? 0) },
                { label: "Avg attempts", value: (monetizationQuery.data.totals.averageAttempts ?? 0).toFixed(2) },
                { label: "Gates / session", value: (monetizationQuery.data.totals.gatesPerSession ?? 0).toFixed(2) },
                { label: "Gates / user", value: (monetizationQuery.data.totals.gatesPerUser ?? 0).toFixed(2) },
              ].map((m) => (
                <MiniStat key={m.label} label={m.label} value={typeof m.value === "string" ? m.value : formatNumber(m.value)} />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" /> Monetization funnel</CardTitle>
              <CardDescription>Gameplay → gate → link → countdown → code → submit → verified → resume</CardDescription>
            </CardHeader>
            <CardContent>
              {(monetizationQuery.data?.funnel ?? []).length === 0 ? (
                <EmptyState title="No data" className="py-12" />
              ) : (
                <div className="space-y-2">
                  {monetizationQuery.data!.funnel.map((f, i) => (
                    <div key={f.step} className="flex items-center gap-3">
                      <div className="w-44 shrink-0 text-right">
                        <p className="text-sm font-medium">{f.label}</p>
                        {f.note && <p className="text-[11px] text-muted-foreground">{f.note}</p>}
                      </div>
                      <div className="h-8 flex-1 overflow-hidden rounded-lg bg-muted/50">
                        <div
                          className="flex h-full items-center rounded-lg bg-brand/20 px-2 text-xs font-semibold text-brand-700"
                          style={{ width: i === 0 ? "100%" : `${Math.max(6, (f.count / (monetizationQuery.data!.funnel[0].count || 1)) * 100)}%` }}
                        >
                          {f.count}
                        </div>
                      </div>
                      <div className="w-28 shrink-0 text-left">
                        {f.conversionPct !== null && <span className="text-xs text-muted-foreground">conv {f.conversionPct}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Gates per day</CardTitle></CardHeader>
            <CardContent>
              {(monetizationQuery.data?.series ?? []).length === 0 ? (
                <EmptyState title="No data" className="py-12" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={monetizationQuery.data!.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="gates" stroke="#2F80ED" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="verified" stroke="#27AE60" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Provider performance</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Gates</TableHead>
                    <TableHead className="text-right">Verified</TableHead>
                    <TableHead className="text-right">Link opens</TableHead>
                    <TableHead className="text-right">Code reqs</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">VR %</TableHead>
                    <TableHead className="text-right">Est. revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(monetizationQuery.data?.byProvider ?? []).map((p) => (
                    <TableRow key={p.providerId ?? "none"}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{p.gates}</TableCell>
                      <TableCell className="text-right">{p.verified}</TableCell>
                      <TableCell className="text-right">{p.linkOpens}</TableCell>
                      <TableCell className="text-right">{p.codeRequests}</TableCell>
                      <TableCell className="text-right">{p.failed}</TableCell>
                      <TableCell className="text-right">{p.verificationRate}%</TableCell>
                      <TableCell className="text-right">{fmtMoney(p.estimatedRevenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── REVENUE ── */}
        <TabsContent value="revenue" className="space-y-6">
          {revenueQuery.data ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-line bg-muted/30 p-3">
                <p className="text-lg font-bold leading-tight">{fmtMoney(revenueQuery.data.totals.estimated ?? 0)}</p>
                <p className="text-xs text-muted-foreground">ESTIMATED revenue</p>
                <Badge variant="orange" className="mt-1">estimate</Badge>
              </div>
              <div className="rounded-xl border border-line bg-muted/30 p-3">
                <p className="text-lg font-bold leading-tight">{fmtMoney(revenueQuery.data.totals.confirmed ?? 0)}</p>
                <p className="text-xs text-muted-foreground">CONFIRMED revenue</p>
                <Badge variant="green" className="mt-1">confirmed</Badge>
              </div>
              <div className="rounded-xl border border-line bg-muted/30 p-3">
                <p className="text-lg font-bold leading-tight">{fmtMoney(revenueQuery.data.totals.total ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Total (est + confirmed)</p>
              </div>
              <div className="rounded-xl border border-line bg-muted/30 p-3">
                <p className="text-lg font-bold leading-tight">{fmtMoney(revenueQuery.data.totals.paid ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Paid</p>
              </div>
              <div className="rounded-xl border border-line bg-muted/30 p-3">
                <p className="text-lg font-bold leading-tight">{fmtMoney(revenueQuery.data.totals.pending ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <div className="rounded-xl border border-line bg-muted/30 p-3">
                <p className="text-lg font-bold leading-tight">{fmtMoney(revenueQuery.data.totals.adjustments ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Adjustments</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          )}

          {revenueQuery.data && revenueQuery.data.totals.estimated + revenueQuery.data.totals.confirmed > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> Estimated vs confirmed per day</CardTitle>
                <CardDescription>Estimated is derived from real activity × admin-entered rates; only confirmed ledger rows are confirmed.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={revenueQuery.data.series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="estimated" stroke="#F2994A" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="confirmed" stroke="#27AE60" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="total" stroke="#2F80ED" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">By provider</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>Provider</TableHead><TableHead className="text-right">Est.</TableHead><TableHead className="text-right">Confirmed</TableHead><TableHead className="text-right">Total</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {(revenueQuery.data?.byProvider ?? []).map((p) => (
                      <TableRow key={p.providerId ?? "none"}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">{fmtMoney(p.estimated)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(p.confirmed)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(p.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">By category</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(revenueQuery.data?.byCategory ?? []).map((c, i) => (
                      <TableRow key={c.name + i}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{fmtMoney(c.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">By event type</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Event</TableHead><TableHead className="text-right">Rows</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(revenueQuery.data?.byEventType ?? []).map((e) => (
                      <TableRow key={e.eventType}>
                        <TableCell className="font-medium">{e.eventType}</TableCell>
                        <TableCell className="text-right">{e.rows}</TableCell>
                        <TableCell className="text-right">{fmtMoney(e.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── CATEGORIES ── */}
        <TabsContent value="categories" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4" /> Category rankings</CardTitle>
              <CardDescription>Usage, verification and estimated revenue per category</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Players</TableHead>
                    <TableHead className="text-right">Moves</TableHead>
                    <TableHead className="text-right">Gates</TableHead>
                    <TableHead className="text-right">Verified</TableHead>
                    <TableHead className="text-right">VR %</TableHead>
                    <TableHead className="text-right">Est. revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankingsQuery.isLoading ? (
                    <TableSkeleton rows={6} cols={8} />
                  ) : (rankingsQuery.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No category activity yet.</TableCell></TableRow>
                  ) : (
                    rankingsQuery.data!.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                            <span className="font-medium">{c.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{c.sessions}</TableCell>
                        <TableCell className="text-right">{c.players}</TableCell>
                        <TableCell className="text-right">{c.questionsAsked}</TableCell>
                        <TableCell className="text-right">{c.gates}</TableCell>
                        <TableCell className="text-right">{c.verifiedGates}</TableCell>
                        <TableCell className="text-right">{c.verificationRate}%</TableCell>
                        <TableCell className="text-right">{fmtMoney(c.estimatedRevenue)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" /> Category performance overview</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Questions</TableHead>
                    <TableHead className="text-right">Plays</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categoriesQuery.isLoading ? (
                    <TableSkeleton rows={5} cols={5} />
                  ) : (categoriesQuery.data ?? []).length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No categories found.</TableCell></TableRow>
                  ) : (
                    (categoriesQuery.data ?? []).slice(0, 25).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                            <span className="font-medium">{c.name}</span>
                            {c.status !== "ACTIVE" && <Badge variant="gray">{c.status}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{c.questionCount}</TableCell>
                        <TableCell className="text-right">{c.playCount}</TableCell>
                        <TableCell className="text-right">{c.sessions}</TableCell>
                        <TableCell className="text-right">{c.completedSessions}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}