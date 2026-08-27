"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Wallet, Download, Plus, RotateCcw, DollarSign, Landmark, Clock, CheckCircle2, BadgeDollarSign } from "lucide-react";
import { apiFetch, getToken, apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { formatDateTime, formatNumber } from "@/lib/utils";

type RevenueConfig = {
  revenuePerVerification: number;
  payoutRate: number;
  currency: string;
};

type RevenueStats = {
  rows: number;
  revenueTotal: number;
  payoutTotal: number;
  pendingRows: number;
  pendingRevenue: number;
  confirmedRows: number;
  confirmedRevenue: number;
  paidRows: number;
  paidRevenue: number;
  autoRows: number;
  manualRows: number;
  currency: string;
  averageRevenue: number;
};

type LedgerRow = {
  id: string;
  type: string;
  providerId: string | null;
  sessionId: string | null;
  userId: string | null;
  currency: string;
  revenueAmount: number;
  payoutAmount: number;
  revenueShare: number;
  status: string;
  providerReference: string | null;
  notes: string | null;
  createdAt: string;
  provider?: { id: string; name: string } | null;
  session?: { id: string; inviteCode: string } | null;
  user?: { id: string; phone: string; name: string | null } | null;
};

const STATUS_VARIANT: Record<string, "green" | "orange" | "gray" | "blue" | "red"> = {
  pending: "orange",
  confirmed: "blue",
  paid: "green",
  rejected: "red",
};

const STATUSES = ["", "pending", "confirmed", "paid", "rejected"];

export default function AdminRevenuePage() {
  const token = getToken();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<RevenueConfig | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [entry, setEntry] = useState({ revenueAmount: "0", payoutAmount: "0", currency: "", providerReference: "", notes: "", status: "pending" });
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const params = () => {
    const p = new URLSearchParams({ page: String(page), limit: "30" });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (status) p.set("status", status);
    return p.toString();
  };

  const configQuery = useQuery<RevenueConfig>({
    queryKey: ["admin-revenue-config"],
    queryFn: () => apiFetch("/api/admin/revenue/config", { token }),
  });

  const cfg = configQuery.data;
  useEffect(() => {
    if (cfg && !config) setConfig({ revenuePerVerification: cfg.revenuePerVerification, payoutRate: cfg.payoutRate, currency: cfg.currency });
  }, [cfg, config]);

  const statsQuery = useQuery<RevenueStats>({
    queryKey: ["admin-revenue-stats", from, to],
    queryFn: () => {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const qs = p.toString();
      return apiFetch(`/api/admin/revenue/stats${qs ? `?${qs}` : ""}`, { token });
    },
  });

  const ledgerQuery = useQuery<{ data: LedgerRow[]; total: number; totalPages: number }>({
    queryKey: ["admin-revenue-ledger", from, to, status, page],
    queryFn: () => apiFetch(`/api/admin/revenue?${params()}`, { token }),
  });

  const saveConfigMutation = useMutation({
    mutationFn: (body: RevenueConfig) => apiFetch("/api/admin/revenue/config", { method: "PUT", body, token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-revenue-config"] });
      setMessage({ kind: "ok", text: "Settings saved" });
    },
    onError: (e: Error) => setMessage({ kind: "err", text: e.message }),
  });

  const addEntryMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/revenue/manual", {
        method: "POST",
        body: {
          revenueAmount: Number(entry.revenueAmount) || 0,
          payoutAmount: entry.payoutAmount ? Number(entry.payoutAmount) || 0 : undefined,
          currency: entry.currency || undefined,
          providerReference: entry.providerReference || undefined,
          notes: entry.notes || undefined,
          status: entry.status,
        },
        token,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-revenue-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["admin-revenue-stats"] });
      setEntry({ revenueAmount: "0", payoutAmount: "0", currency: "", providerReference: "", notes: "", status: "pending" });
      setMessage({ kind: "ok", text: "Ledger entry added" });
    },
    onError: (e: Error) => setMessage({ kind: "err", text: e.message }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/api/admin/revenue/${id}/status`, { method: "POST", body: { status }, token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-revenue-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["admin-revenue-stats"] });
    },
    onError: (e: Error) => setMessage({ kind: "err", text: e.message }),
  });

  const backfillMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/revenue/backfill", { method: "POST", token }),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["admin-revenue-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["admin-revenue-stats"] });
      setMessage({ kind: "ok", text: `Backfill complete — ${(d as { created: number })?.created ?? 0} row(s) created` });
    },
    onError: (e: Error) => setMessage({ kind: "err", text: e.message }),
  });

  const download = async () => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (status) p.set("status", status);
    const res = await fetch(apiUrl(`/api/admin/revenue/export${p.toString() ? `?${p.toString()}` : ""}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "revenue-ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = statsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
          <p className="text-sm text-muted-foreground">Monetization ledger — auto rows per verification, manual adjustments, payouts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={download}><Download className="mr-2 h-4 w-4" /> Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}>
            <RotateCcw className="mr-2 h-4 w-4" /> {backfillMutation.isPending ? "Backfilling…" : "Backfill from events"}
          </Button>
        </div>
      </div>

      {message && (
        <div className={`rounded-xl border p-3 text-sm ${message.kind === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Revenue" value={`${s?.currency ?? "USD"} ${formatNumber(s?.revenueTotal ?? 0)}`} icon={DollarSign} accent="green" loading={statsQuery.isLoading} />
        <StatCard title="Payout" value={`${s?.currency ?? "USD"} ${formatNumber(s?.payoutTotal ?? 0)}`} icon={Landmark} accent="purple" loading={statsQuery.isLoading} />
        <StatCard title="Pending" value={`${s?.currency ?? "USD"} ${formatNumber(s?.pendingRevenue ?? 0)}`} icon={Clock} accent="orange" loading={statsQuery.isLoading} />
        <StatCard title="Paid" value={`${s?.currency ?? "USD"} ${formatNumber(s?.paidRevenue ?? 0)}`} icon={BadgeDollarSign} accent="brand" loading={statsQuery.isLoading} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Settings + manual entry */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> Settings</CardTitle>
              <CardDescription>Per-verification revenue and provider payout rate</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Revenue per verification</Label>
                <Input type="number" step="0.01" min={0} value={config?.revenuePerVerification ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...(c as RevenueConfig), revenuePerVerification: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Payout rate (0–1)</Label>
                <Input type="number" step="0.01" min={0} max={1} value={config?.payoutRate ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...(c as RevenueConfig), payoutRate: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input maxLength={8} value={config?.currency ?? "USD"}
                  onChange={(e) => setConfig((c) => ({ ...(c as RevenueConfig), currency: e.target.value.toUpperCase() }))} />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => config && saveConfigMutation.mutate(config)} disabled={saveConfigMutation.isPending || !config}>
                  {saveConfigMutation.isPending ? "Saving…" : "Save Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Manual Entry</CardTitle>
              <CardDescription>Adjustments, refunds or ad-hoc credits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Revenue</Label>
                  <Input type="number" step="0.01" value={entry.revenueAmount} onChange={(e) => setEntry({ ...entry, revenueAmount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Payout</Label>
                  <Input type="number" step="0.01" value={entry.payoutAmount} onChange={(e) => setEntry({ ...entry, payoutAmount: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input placeholder="USD" value={entry.currency} onChange={(e) => setEntry({ ...entry, currency: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <select value={entry.status} onChange={(e) => setEntry({ ...entry, status: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="paid">Paid</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reference</Label>
                <Input placeholder="e.g. Invoice #1234" value={entry.providerReference} onChange={(e) => setEntry({ ...entry, providerReference: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input placeholder="Reason for adjustment" value={entry.notes} onChange={(e) => setEntry({ ...entry, notes: e.target.value })} />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => addEntryMutation.mutate()} disabled={addEntryMutation.isPending}>
                  {addEntryMutation.isPending ? "Adding…" : "Add Entry"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Ledger */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-4 w-4" /> Ledger</CardTitle>
            <CardDescription>pending → confirmed → paid</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" />
              <span className="text-sm text-muted-foreground">to</span>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" />
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatus(s); setPage(1); }}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                      status === s ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
                    }`}
                  >
                    {s || "All"}
                  </button>
                ))}
              </div>
            </div>

            {ledgerQuery.isLoading ? (
              <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (ledgerQuery.data?.data ?? []).length === 0 ? (
              <EmptyState icon={Wallet} title="No ledger entries" description="Auto rows appear on verification; add manual entries above." className="py-12" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Payout</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ledgerQuery.data?.data ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><Badge variant={r.type === "AUTO" ? "green" : "blue"}>{r.type}</Badge></TableCell>
                      <TableCell className="text-sm">{r.provider?.name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{r.session?.inviteCode ?? "—"}</TableCell>
                      <TableCell className="font-medium">{r.currency} {r.revenueAmount.toFixed(2)}</TableCell>
                      <TableCell>{r.payoutAmount.toFixed(2)}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT[r.status] ?? "gray"}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <select
                          value={r.status}
                          disabled={statusMutation.isPending}
                          onChange={(e) => statusMutation.mutate({ id: r.id, status: e.target.value })}
                          className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                        >
                          <option value="pending">Pending</option>
                          <option value="confirmed">Confirm</option>
                          <option value="paid">Mark paid</option>
                          <option value="rejected">Reject</option>
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {(ledgerQuery.data?.totalPages ?? 0) > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Page {page} of {ledgerQuery.data?.totalPages} ({formatNumber(ledgerQuery.data?.total ?? 0)})</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page >= (ledgerQuery.data?.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}