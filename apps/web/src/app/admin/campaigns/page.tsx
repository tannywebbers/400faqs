"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import {
  Megaphone,
  PlayCircle,
  PauseCircle,
  Square,
  Plus,
  Users,
  CheckCircle2,
  MailCheck,
  Eye,
  AlertTriangle,
  Target,
  ArrowRight,
} from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { useAdminList } from "@/hooks/use-admin-list";
import { formatDateTime, formatNumber } from "@/lib/utils";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  messageType: string;
  templateId: string | null;
  template: { id: string; name: string } | null;
  messageBody: string | null;
  audience: string;
  scheduleType: string;
  scheduledAt: string | null;
  cronExpression: string | null;
  rateLimitPerMinute: number;
  status: string;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  skippedCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  _count: { deliveries: number };
  createdAt: string;
};

type CampaignStats = {
  stats: {
    total: number;
    draft: number;
    scheduled: number;
    running: number;
    paused: number;
    completed: number;
    cancelled: number;
    totalRecipients: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    skipped: number;
  };
  settings: { autoProcess: boolean; defaultRateLimitPerMinute: number; maxRecipients: number };
};

type Template = { id: string; name: string; body: string; status: string };

const STATUS_VARIANT: Record<string, "green" | "orange" | "gray" | "blue" | "red"> = {
  DRAFT: "gray",
  SCHEDULED: "blue",
  RUNNING: "green",
  PAUSED: "orange",
  COMPLETED: "green",
  CANCELLED: "red",
};

const AUDIENCES: { value: string; label: string }[] = [
  { value: "all_users", label: "All active users" },
  { value: "active_users", label: "Active recently (lastActiveDays)" },
  { value: "players", label: "Players (min completed sessions)" },
  { value: "contributors", label: "Contributors (min contributions)" },
  { value: "specific_users", label: "Specific phones" },
  { value: "seed_invites", label: "Waiting seed invitations" },
];

function emptyForm() {
  return {
    name: "",
    description: "",
    messageType: "text",
    templateId: "",
    messageBody: "",
    audience: "all_users",
    lastActiveDays: "30",
    minSessions: "1",
    minContributions: "1",
    phones: "",
    scheduleType: "now",
    scheduledAt: "",
    cronExpression: "0 10 * * *",
    rateLimitPerMinute: "60",
  };
}

export default function AdminCampaignsPage() {
  const token = getToken();
  const queryClient = useQueryClient();
  const list = useAdminList<Campaign>({ path: "/api/admin/campaigns", limit: 20 });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [preview, setPreview] = useState<{ count: number; capped: boolean; cap: number; sample: { userId: string | null; phone: string }[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statsQuery = useQuery<CampaignStats>({
    queryKey: ["admin-campaigns-stats"],
    queryFn: () => apiFetch("/api/admin/campaigns/stats", { token }),
  });

  const templatesQuery = useQuery<{ data: Template[]; total: number }>({
    queryKey: ["admin-campaign-templates"],
    queryFn: () => apiFetch("/api/admin/whatsapp/templates?limit=100&status=APPROVED", { token }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const createMutation = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        messageType: form.messageType,
        messageBody: form.messageBody || null,
        audience: form.audience,
        scheduleType: form.scheduleType,
        rateLimitPerMinute: Number(form.rateLimitPerMinute) || 60,
      };
      if (form.templateId) body.templateId = form.templateId;
      if (form.scheduleType === "scheduled" && form.scheduledAt) body.scheduledAt = new Date(form.scheduledAt).toISOString();
      if (form.scheduleType === "recurring" && form.cronExpression) body.cronExpression = form.cronExpression;
      const audienceFilter: Record<string, unknown> = {};
      if (form.audience === "active_users") audienceFilter.lastActiveDays = Number(form.lastActiveDays) || 30;
      if (form.audience === "players") {
        audienceFilter.minSessions = Number(form.minSessions) || 1;
        audienceFilter.lastActiveDays = Number(form.lastActiveDays) || 90;
      }
      if (form.audience === "contributors") audienceFilter.minContributions = Number(form.minContributions) || 1;
      if (form.audience === "specific_users") audienceFilter.phones = form.phones.split(",").map((p) => p.trim()).filter(Boolean);
      body.audienceFilter = audienceFilter;
      return apiFetch("/api/admin/campaigns", { method: "POST", body, token });
    },
    onSuccess: () => {
      setShowForm(false);
      setForm(emptyForm());
      setPreview(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns-stats"] });
      list.refetch();
    },
    onError: (e: Error) => setError(e.message),
  });

  const mutate = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "start" | "pause" | "resume" | "cancel" }) =>
      apiFetch(`/api/admin/campaigns/${id}/${action}`, { method: "POST", token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns-stats"] });
    },
  });

  const previewMutation = useMutation<
    { count: number; capped: boolean; cap: number; sample: { userId: string | null; phone: string }[] },
    Error
  >({
    mutationFn: () => {
      const audienceFilter: Record<string, unknown> = {};
      if (form.audience === "active_users") audienceFilter.lastActiveDays = Number(form.lastActiveDays) || 30;
      if (form.audience === "players") {
        audienceFilter.minSessions = Number(form.minSessions) || 1;
        audienceFilter.lastActiveDays = Number(form.lastActiveDays) || 90;
      }
      if (form.audience === "contributors") audienceFilter.minContributions = Number(form.minContributions) || 1;
      if (form.audience === "specific_users") audienceFilter.phones = form.phones.split(",").map((p) => p.trim()).filter(Boolean);
      return apiFetch("/api/admin/campaigns/audience/preview", {
        method: "POST",
        body: { audience: form.audience, audienceFilter },
        token,
      });
    },
    onSuccess: (data) => {
      setPreview(data);
      setPreviewError(null);
    },
    onError: (e: Error) => setPreviewError(e.message),
  });

  const s = statsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Create, schedule and track WhatsApp marketing campaigns</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-2 h-4 w-4" /> {showForm ? "Close" : "New Campaign"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Recipients" value={formatNumber(s?.stats.totalRecipients ?? 0)} icon={Users} accent="brand" loading={statsQuery.isLoading} />
        <StatCard title="Sent" value={formatNumber(s?.stats.sent ?? 0)} icon={PlayCircle} accent="green" loading={statsQuery.isLoading} />
        <StatCard title="Delivered" value={formatNumber(s?.stats.delivered ?? 0)} icon={MailCheck} accent="purple" loading={statsQuery.isLoading} />
        <StatCard title="Read" value={formatNumber(s?.stats.read ?? 0)} icon={Eye} accent="orange" loading={statsQuery.isLoading} />
        <StatCard title="Running" value={formatNumber(s?.stats.running ?? 0)} icon={Megaphone} accent="green" loading={statsQuery.isLoading} />
        <StatCard title="Scheduled" value={formatNumber(s?.stats.scheduled ?? 0)} icon={Target} accent="purple" loading={statsQuery.isLoading} />
        <StatCard title="Completed" value={formatNumber(s?.stats.completed ?? 0)} icon={CheckCircle2} accent="green" loading={statsQuery.isLoading} />
        <StatCard title="Failed" value={formatNumber(s?.stats.failed ?? 0)} icon={AlertTriangle} accent="red" loading={statsQuery.isLoading} />
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Campaign</CardTitle>
            <CardDescription>
              {s?.settings.autoProcess
                ? `Auto-processing enabled — scheduled campaigns start automatically (${s.settings.defaultRateLimitPerMinute}/min default, max ${formatNumber(s.settings.maxRecipients)} recipients).`
                : "Auto-processing disabled — campaigns must be started manually."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input placeholder="e.g. Weekend trivia blast" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Optional note" value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Message Type</Label>
                <select value={form.messageType} onChange={(e) => set("messageType", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="text">Plain text</option>
                  <option value="template">Template</option>
                </select>
              </div>
              {form.messageType === "template" ? (
                <div className="space-y-2">
                  <Label>Template (approved)</Label>
                  <select value={form.templateId} onChange={(e) => set("templateId", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Select template…</option>
                    {(templatesQuery.data?.data ?? []).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Message Body *</Label>
                  <textarea
                    rows={2}
                    placeholder="Message text. Use {{1}} placeholders where needed."
                    value={form.messageBody}
                    onChange={(e) => set("messageBody", e.target.value)}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Audience</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {AUDIENCES.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => set("audience", a.value)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                      form.audience === a.value ? "border-brand bg-brand/5 text-brand-700" : "border-line bg-white text-muted-foreground hover:bg-surface"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {form.audience === "active_users" && (
                <div className="space-y-2">
                  <Label>Last active (days)</Label>
                  <Input type="number" min={1} value={form.lastActiveDays} onChange={(e) => set("lastActiveDays", e.target.value)} />
                </div>
              )}
              {form.audience === "players" && (
                <>
                  <div className="space-y-2">
                    <Label>Min completed sessions</Label>
                    <Input type="number" min={1} value={form.minSessions} onChange={(e) => set("minSessions", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Last active (days)</Label>
                    <Input type="number" min={1} value={form.lastActiveDays} onChange={(e) => set("lastActiveDays", e.target.value)} />
                  </div>
                </>
              )}
              {form.audience === "contributors" && (
                <div className="space-y-2">
                  <Label>Min contributions</Label>
                  <Input type="number" min={1} value={form.minContributions} onChange={(e) => set("minContributions", e.target.value)} />
                </div>
              )}
              {form.audience === "specific_users" && (
                <div className="space-y-2 sm:col-span-3">
                  <Label>Phone numbers (comma separated)</Label>
                  <Input placeholder="1234567890, 9876543210" value={form.phones} onChange={(e) => set("phones", e.target.value)} />
                </div>
              )}
            </div>

            <Button variant="outline" size="sm" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
              <Target className="mr-2 h-4 w-4" /> {previewMutation.isPending ? "Resolving…" : "Preview Audience"}
            </Button>
            {preview && (
              <div className="rounded-xl border border-line bg-muted/30 p-4 text-sm">
                <p className="font-semibold">
                  {formatNumber(preview.count)} recipient{preview.count === 1 ? "" : "s"}
                  {preview.capped && <span className="ml-2 font-normal text-amber-600">(capped at {formatNumber(preview.cap)})</span>}
                </p>
                {preview.sample.length > 0 && (
                  <p className="mt-1 text-muted-foreground">Sample: {preview.sample.map((x) => x.phone).join(", ")}</p>
                )}
              </div>
            )}
            {previewError && <p className="text-sm text-red-600">{previewError}</p>}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Schedule</Label>
                <select value={form.scheduleType} onChange={(e) => set("scheduleType", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="now">Send now</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="recurring">Recurring</option>
                </select>
              </div>
              {form.scheduleType === "scheduled" && (
                <div className="space-y-2">
                  <Label>Start at</Label>
                  <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} />
                </div>
              )}
              {form.scheduleType === "recurring" && (
                <div className="space-y-2">
                  <Label>Cron expression (5-field)</Label>
                  <Input value={form.cronExpression} onChange={(e) => set("cronExpression", e.target.value)} />
                </div>
              )}
              <div className="space-y-2">
                <Label>Rate limit (msgs/min)</Label>
                <Input type="number" min={1} value={form.rateLimitPerMinute} onChange={(e) => set("rateLimitPerMinute", e.target.value)} />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name}>
                {createMutation.isPending ? "Creating…" : "Create Campaign"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaigns</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {list.isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
            </div>
          ) : (list.data?.data ?? []).length === 0 ? (
            <EmptyState icon={Megaphone} title="No campaigns" description="Create your first campaign to reach players on WhatsApp." className="py-12" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Delivered/Read</TableHead>
                  <TableHead>Next Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(list.data?.data ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.messageType === "template" ? (c.template?.name ?? "template") : "text"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="gray">{c.audience.split("_").join(" ")}</Badge>
                    </TableCell>
                    <TableCell>{formatNumber(c.totalRecipients)}</TableCell>
                    <TableCell>
                      <span className="font-medium text-green-600">{c.deliveredCount}</span>
                      <span className="text-muted-foreground"> / {c.readCount}</span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.nextRunAt ? formatDateTime(c.nextRunAt) : c.scheduleType === "now" || c.scheduleType === "scheduled" ? "—" : "—"}
                    </TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[c.status] ?? "gray"}>{c.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/admin/campaigns/${c.id}`}>
                          <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button>
                        </Link>
                        {(c.status === "DRAFT" || c.status === "SCHEDULED") && (
                          <Button variant="ghost" size="sm" className="text-green-600" disabled={mutate.isPending} onClick={() => mutate.mutate({ id: c.id, action: "start" })}>
                            Start
                          </Button>
                        )}
                        {(c.status === "RUNNING" || c.status === "SCHEDULED") && (
                          <Button variant="ghost" size="sm" disabled={mutate.isPending} onClick={() => mutate.mutate({ id: c.id, action: "pause" })}>
                            <PauseCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {c.status === "PAUSED" && (
                          <Button variant="ghost" size="sm" className="text-green-600" disabled={mutate.isPending} onClick={() => mutate.mutate({ id: c.id, action: "resume" })}>
                            <PlayCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {(c.status === "RUNNING" || c.status === "SCHEDULED" || c.status === "PAUSED") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            disabled={mutate.isPending}
                            onClick={() => { if (confirm(`Cancel "${c.name}"?`)) mutate.mutate({ id: c.id, action: "cancel" }); }}
                          >
                            <Square className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {(list.data?.totalPages ?? 0) > 1 && (
            <div className="flex items-center justify-between border-t border-line p-4">
              <p className="text-sm text-muted-foreground">Page {list.page} of {list.data?.totalPages} ({list.data?.total})</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={list.page >= (list.data?.totalPages ?? 1)} onClick={() => list.setPage(list.page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}