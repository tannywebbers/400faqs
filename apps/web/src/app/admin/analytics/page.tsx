"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users,
  HelpCircle,
  PlayCircle,
  Activity,
  Sparkles,
  MessageCircle,
  Download,
  Camera,
  Bot,
  AlertTriangle,
  TrendingUp,
  ListChecks,
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
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { formatNumber, formatDate } from "@/lib/utils";

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

type WhatsAppStats = {
  totals: Record<string, number>;
  byType: { type: string; count: number }[];
  byStatus: { status: string; count: number }[];
  last7Days: { date: string; outbound: number; inbound: number }[];
};

type AIStats = {
  totalChecked: number;
  aiAvailable: number;
  aiUnavailable: number;
  byClassification: { classification: string; count: number }[];
  duplicateFound: number;
  reviewRequired: number;
  averageScore: number;
  averageConfidence: number;
  byModel: { model: string | null; count: number }[];
  last7Days: { date: string; checked: number; duplicates: number }[];
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

type TopQuestion = {
  id: string;
  text: string;
  type: string;
  playsCount: number;
  reportCount: number;
  difficulty: number;
  aiScore: number | null;
  createdAt: string;
  category: { id: string; name: string; slug: string };
};

type SnapshotRow = {
  id: string;
  date: string;
  totals: Record<string, number>;
  day: Record<string, number>;
};

export default function AdminAnalyticsPage() {
  const token = getToken();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activeRange, setActiveRange] = useState<number>(30);

  const applyRange = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
    setActiveRange(days);
  };

  const params = () => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  };

  const analyticsQuery = useQuery<AdminAnalytics>({
    queryKey: ["admin-analytics", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics?${params()}`, { token }),
    placeholderData: (prev) => prev,
  });

  const whatsappQuery = useQuery<WhatsAppStats>({
    queryKey: ["admin-analytics-whatsapp", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/whatsapp?${params()}`, { token }),
  });

  const aiQuery = useQuery<AIStats>({
    queryKey: ["admin-analytics-ai", from, to],
    queryFn: () => apiFetch(`/api/admin/analytics/ai?${params()}`, { token }),
  });

  const categoriesQuery = useQuery<CategoryStat[]>({
    queryKey: ["admin-analytics-categories"],
    queryFn: () => apiFetch("/api/admin/analytics/categories", { token }),
  });

  const questionsQuery = useQuery<TopQuestion[]>({
    queryKey: ["admin-analytics-questions"],
    queryFn: () => apiFetch("/api/admin/analytics/questions?limit=10", { token }),
  });

  const snapshotsQuery = useQuery<SnapshotRow[]>({
    queryKey: ["admin-analytics-snapshots"],
    queryFn: () => apiFetch("/api/admin/analytics/snapshots?days=120", { token }),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Platform, WhatsApp, AI, categories &amp; snapshot reporting</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => download(`/api/admin/analytics/export?${params()}`, "analytics.csv")} disabled={!d}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => applyRange(30)} className={activeRange === 30 ? "border-brand text-brand" : ""}>30D</Button>
          <Button variant="outline" size="sm" onClick={() => applyRange(90)} className={activeRange === 90 ? "border-brand text-brand" : ""}>90D</Button>
          <Button variant="outline" size="sm" onClick={() => applyRange(365)} className={activeRange === 365 ? "border-brand text-brand" : ""}>1Y</Button>
        </div>
      </div>

      {/* Date range */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="w-44" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <button onClick={() => applyRange(7)} className={activeRange === 7 ? "font-semibold text-brand" : ""}>7d</button>
            <button onClick={() => applyRange(14)} className={activeRange === 14 ? "font-semibold text-brand" : ""}>14d</button>
            <button onClick={() => applyRange(30)} className={activeRange === 30 ? "font-semibold text-brand" : ""}>30d</button>
            <button onClick={() => applyRange(60)} className={activeRange === 60 ? "font-semibold text-brand" : ""}>60d</button>
            <button onClick={() => applyRange(90)} className={activeRange === 90 ? "font-semibold text-brand" : ""}>90d</button>
          </div>
          {d && (
            <p className="text-sm text-muted-foreground sm:ml-auto">
              {formatDate(d.start)} – {formatDate(d.end)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="New Users" value={formatNumber(d?.totals.users ?? 0)} icon={Users} accent="brand" loading={analyticsQuery.isLoading} />
        <StatCard title="Questions" value={formatNumber(d?.totals.questions ?? 0)} icon={HelpCircle} accent="green" loading={analyticsQuery.isLoading} />
        <StatCard title="Sessions" value={formatNumber(d?.totals.sessions ?? 0)} icon={PlayCircle} accent="orange" loading={analyticsQuery.isLoading} />
        <StatCard title="Moves" value={formatNumber(d?.totals.moves ?? 0)} icon={Activity} accent="purple" loading={analyticsQuery.isLoading} />
        <StatCard title="Contributions" value={formatNumber(d?.totals.contributions ?? 0)} icon={Sparkles} accent="brand" loading={analyticsQuery.isLoading} />
        <StatCard title="Reports" value={formatNumber(d?.totals.reports ?? 0)} icon={AlertTriangle} accent="red" loading={analyticsQuery.isLoading} />
        <StatCard title="Messages" value={formatNumber(d?.totals.messages ?? 0)} icon={MessageCircle} accent="green" loading={analyticsQuery.isLoading} />
        <StatCard title="Revenue Rows" value={formatNumber(d?.totals.revenueLedger ?? 0)} icon={TrendingUp} accent="orange" loading={analyticsQuery.isLoading} />
      </div>

      {/* Usage charts */}
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

      {/* WhatsApp + AI stats */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4" /> WhatsApp</CardTitle>
            <CardDescription>Message volume and delivery over the range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Conversations", value: whatsappQuery.data?.totals.conversations ?? 0 },
                { label: "Outbound", value: whatsappQuery.data?.totals.outbound ?? 0 },
                { label: "Delivered", value: whatsappQuery.data?.totals.delivered ?? 0 },
                { label: "Read", value: whatsappQuery.data?.totals.read ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-line bg-muted/30 p-3">
                  <p className="text-lg font-bold">{formatNumber(value)}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {(whatsappQuery.data?.last7Days ?? []).length > 0 && (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={whatsappQuery.data!.last7Days} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
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
            {(["failed", "sent", "received", "unknown"] as const).map((s) =>
              (whatsappQuery.data?.byStatus ?? []).find((x) => x.status === s) ? (
                <div key={s} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{s}</span>
                  <span className="font-medium">{formatNumber((whatsappQuery.data?.byStatus ?? []).find((x) => x.status === s)?.count ?? 0)}</span>
                </div>
              ) : null
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" /> AI Duplicate Detection</CardTitle>
            <CardDescription>Contribution screening quality</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Checked", value: aiQuery.data?.totalChecked ?? 0 },
                { label: "Duplicates", value: aiQuery.data?.duplicateFound ?? 0 },
                { label: "Review Rule", value: aiQuery.data?.reviewRequired ?? 0 },
                { label: "Avg Score", value: (aiQuery.data?.averageScore ?? 0).toFixed(2) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-line bg-muted/30 p-3">
                  <p className="text-lg font-bold">{typeof value === "number" ? formatNumber(value) : value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {aiQuery.data?.byClassification.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={aiQuery.data.byClassification.map((c) => ({ name: c.classification, count: c.count }))} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#BB6BD9" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No AI screenings in the selected range.</p>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">AI available</span>
              <span className="font-medium">{formatNumber(aiQuery.data?.aiAvailable ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Categories + top questions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4" /> Category Performance</CardTitle>
          </CardHeader>
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
                {categoriesQuery.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-14" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : (categoriesQuery.data ?? []).slice(0, 10).map((c) => (
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
                    ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4" /> Top Questions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Question</TableHead>
                  <TableHead className="text-right">Plays</TableHead>
                  <TableHead className="text-right">Reports</TableHead>
                  <TableHead className="text-right">Difficulty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questionsQuery.isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 4 }).map((__, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  : (questionsQuery.data ?? []).map((q) => (
                      <TableRow key={q.id}>
                        <TableCell>
                          <p className="line-clamp-1 font-medium">{q.text}</p>
                          <p className="text-xs text-muted-foreground">{q.category.name}</p>
                        </TableCell>
                        <TableCell className="text-right">{q.playsCount}</TableCell>
                        <TableCell className="text-right">{q.reportCount}</TableCell>
                        <TableCell className="text-right">{q.difficulty}</TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
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
    </div>
  );
}