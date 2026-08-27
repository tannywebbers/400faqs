"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, PlayCircle, PauseCircle, Square, Download, Users, Send, MailCheck, Eye, AlertTriangle } from "lucide-react";
import { apiFetch, getToken, apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { formatDateTime, formatNumber, maskPhone } from "@/lib/utils";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  messageType: string;
  templateId: string | null;
  template: { id: string; name: string; body: string } | null;
  messageBody: string | null;
  headerText: string | null;
  footerText: string | null;
  audience: string;
  audienceFilter: Record<string, unknown> | null;
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

type Delivery = {
  id: string;
  phone: string;
  status: string;
  attempt: number;
  error: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  user: { id: string; phone: string; name: string | null; displayName: string | null } | null;
};

const DELIVERY_VARIANT: Record<string, "green" | "orange" | "gray" | "blue" | "red"> = {
  queued: "gray",
  sent: "blue",
  delivered: "green",
  read: "green",
  failed: "red",
  skipped: "orange",
};

const DELIVERY_STATUSES = ["", "queued", "sent", "delivered", "read", "failed", "skipped"];

export default function AdminCampaignDetailPage() {
  const { id } = useParams() as { id: string };
  const token = getToken();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const campaignQuery = useQuery<Campaign>({
    queryKey: ["admin-campaign", id],
    queryFn: () => apiFetch(`/api/admin/campaigns/${id}`, { token }),
  });

  const deliveriesQuery = useQuery<{ data: Delivery[]; total: number; totalPages: number }>({
    queryKey: ["admin-campaign-deliveries", id, statusFilter, q, page],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (statusFilter) params.set("status", statusFilter);
      if (q) params.set("q", q);
      return apiFetch(`/api/admin/campaigns/${id}/deliveries?${params}`, { token });
    },
  });

  const lifecycle = useMutation({
    mutationFn: (action: "start" | "pause" | "resume" | "cancel") => apiFetch(`/api/admin/campaigns/${id}/${action}`, { method: "POST", token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-campaign-deliveries", id] });
    },
  });

  const download = async () => {
    const res = await fetch(apiUrl(`/api/admin/campaigns/${id}/export`), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "deliveries.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const c = campaignQuery.data;

  const progressTotal = Math.max(c?.totalRecipients ?? 0, 1);
  const progressWidth = (count: number) => `${Math.round((count / progressTotal) * 100)}%`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin/campaigns" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to campaigns
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{c?.name ?? "Campaign"}</h1>
          <p className="text-sm text-muted-foreground">{c?.description || (c ? "No description" : "Loading…")}</p>
        </div>
        <div className="flex items-center gap-2">
          {c && (
            <Badge variant={c.status === "RUNNING" ? "green" : c.status === "PAUSED" ? "orange" : c.status === "COMPLETED" ? "green" : c.status === "CANCELLED" ? "red" : c.status === "SCHEDULED" ? "blue" : "gray"}>
              {c.status}
            </Badge>
          )}
          {c && c.status === "RUNNING" && (
            <Button variant="outline" size="sm" onClick={() => lifecycle.mutate("pause")} disabled={lifecycle.isPending}><PauseCircle className="mr-2 h-4 w-4" /> Pause</Button>
          )}
          {c && c.status === "PAUSED" && (
            <Button variant="outline" size="sm" onClick={() => lifecycle.mutate("resume")} disabled={lifecycle.isPending}><PlayCircle className="mr-2 h-4 w-4" /> Resume</Button>
          )}
          {(c?.status === "DRAFT" || c?.status === "SCHEDULED") && (
            <Button variant="outline" size="sm" onClick={() => lifecycle.mutate("start")} disabled={lifecycle.isPending}><PlayCircle className="mr-2 h-4 w-4" /> Start</Button>
          )}
          {(c?.status === "RUNNING" || c?.status === "SCHEDULED") && (
            <Button variant="outline" size="sm" className="text-red-600" onClick={() => { if (confirm("Cancel this campaign?")) lifecycle.mutate("cancel"); }} disabled={lifecycle.isPending}>
              <Square className="mr-2 h-4 w-4" /> Cancel
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={download} disabled={!c}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Recipients" value={formatNumber(c?.totalRecipients ?? 0)} icon={Users} accent="brand" loading={campaignQuery.isLoading} />
        <StatCard title="Sent" value={formatNumber(c?.sentCount ?? 0)} icon={Send} accent="orange" loading={campaignQuery.isLoading} />
        <StatCard title="Delivered" value={formatNumber(c?.deliveredCount ?? 0)} icon={MailCheck} accent="green" loading={campaignQuery.isLoading} />
        <StatCard title="Read" value={formatNumber(c?.readCount ?? 0)} icon={Eye} accent="purple" loading={campaignQuery.isLoading} />
        <StatCard title="Failed" value={formatNumber(c?.failedCount ?? 0)} icon={AlertTriangle} accent="red" loading={campaignQuery.isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          {campaignQuery.isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : !c ? (
            <EmptyState title="Campaign not found" className="py-10" />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Message</p><p className="font-medium">{c.messageType === "template" ? `Template: ${c.template?.name ?? "—"}` : "Plain text"}</p></div>
                <div><p className="text-xs text-muted-foreground">Audience</p><p className="font-medium capitalize">{c.audience.split("_").join(" ")}</p></div>
                <div><p className="text-xs text-muted-foreground">Schedule</p><p className="font-medium">{c.scheduleType}{c.cronExpression ? ` · ${c.cronExpression}` : ""}</p></div>
                <div><p className="text-xs text-muted-foreground">Rate limit</p><p className="font-medium">{c.rateLimitPerMinute} / min</p></div>
                <div><p className="text-xs text-muted-foreground">Started</p><p className="font-medium">{c.lastRunAt ? formatDateTime(c.lastRunAt) : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Next run</p><p className="font-medium">{c.nextRunAt ? formatDateTime(c.nextRunAt) : "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Deliveries</p><p className="font-medium">{formatNumber(c._count.deliveries)}</p></div>
                <div><p className="text-xs text-muted-foreground">Created by</p><p className="font-medium">{c.createdBy?.name ?? c.createdBy?.email ?? "—"}</p></div>
              </div>
              {c.totalRecipients > 0 && (
                <div className="space-y-2">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div className="flex h-full">
                      <div className="bg-sky-500" style={{ width: progressWidth(c.sentCount) }} title={`sent ${c.sentCount}`} />
                      <div className="bg-green-500" style={{ width: progressWidth(c.deliveredCount) }} title={`delivered ${c.deliveredCount}`} />
                      <div className="bg-purple-500" style={{ width: progressWidth(c.readCount) }} title={`read ${c.readCount}`} />
                      <div className="bg-red-500" style={{ width: progressWidth(c.failedCount) }} title={`failed ${c.failedCount}`} />
                      <div className="bg-amber-400" style={{ width: progressWidth(c.skippedCount) }} title={`skipped ${c.skippedCount}`} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    sent {c.sentCount} · delivered {c.deliveredCount} · read {c.readCount} · failed {c.failedCount} · skipped {c.skippedCount}
                  </p>
                </div>
              )}
              {c.messageBody && (
                <div className="rounded-xl border border-line bg-muted/30 p-3 text-sm">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Message</p>
                  <p className="whitespace-pre-wrap">{c.messageBody}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deliveries</CardTitle>
          <CardDescription>Per-recipient delivery status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              {DELIVERY_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    statusFilter === s ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
                  }`}
                >
                  {s || "All"}
                </button>
              ))}
            </div>
            <Input placeholder="Search phone…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="sm:ml-auto sm:w-48" />
          </div>

          {deliveriesQuery.isLoading ? (
            <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (deliveriesQuery.data?.data ?? []).length === 0 ? (
            <EmptyState title="No deliveries" description="No deliveries match the current filters." className="py-12" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempt</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Read</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(deliveriesQuery.data?.data ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{maskPhone(d.phone)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.user?.displayName ?? d.user?.name ?? "—"}</TableCell>
                    <TableCell><Badge variant={DELIVERY_VARIANT[d.status] ?? "gray"}>{d.status}</Badge></TableCell>
                    <TableCell>{d.attempt}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.sentAt ? formatDateTime(d.sentAt) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.deliveredAt ? formatDateTime(d.deliveredAt) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.readAt ? formatDateTime(d.readAt) : "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-xs text-red-600">{d.error ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {(deliveriesQuery.data?.totalPages ?? 0) > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page {page} of {deliveriesQuery.data?.totalPages} ({formatNumber(deliveriesQuery.data?.total ?? 0)})</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= (deliveriesQuery.data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}