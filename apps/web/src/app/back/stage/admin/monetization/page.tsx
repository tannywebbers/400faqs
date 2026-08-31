"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import {
  ShieldCheck,
  Timer,
  Plus,
  ToggleLeft,
  Archive,
  Link2,
  FileCode2,
  ListChecks,
  Activity,
  Check,
  Copy,
  Trash2,
  X,
  BarChart3,
} from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, timeAgo, maskPhone } from "@/lib/utils";

type MonetizationConfig = {
  enabled: boolean;
  roundInterval: number;
  countdownSeconds: number;
  codeExpiryMinutes: number;
  linkExpiryMinutes: number;
  maxAttempts: number;
  codeLength: number;
  codeType: "numeric" | "alphanumeric";
  rotation: "priority" | "random";
  defaultProviderId: string;
  defaultSnippetId: string;
  directLink: string;
  directLinkEnabled: boolean;
};

type MonetizationStats = {
  total: number;
  pending: number;
  verified: number;
  expired: number;
  failed: number;
  cancelled: number;
  failedVerifications: number;
  successRate: number;
  averageVerificationSeconds: number;
  last7Days: Record<string, number>;
};

type AdProvider = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  enabled: boolean;
  archived: boolean;
  priority: number;
  configuration: unknown;
  placements: unknown;
  revenueModel: string;
  currency: string;
  cpmRate: number;
  cpcRate: number;
  cpaRate: number;
  fixedPayoutPerVerification: number;
  createdAt: string;
  _count?: { snippets: number; gates: number };
};

type AdTypesMeta = {
  providerTypes: string[];
  placements: string[];
  eventTypes: string[];
};

type ProviderStats = {
  impressions: number;
  clicks: number;
  conversions: number;
  verifications: number;
  verifiedGates: number;
  ctr: number;
  conversionRate: number;
  revenue: { estimated: number; confirmed: number; paid: number; payoutEstimated: number };
  byEventType: { eventType: string; rows: number; amount: number }[];
};

type AdSnippet = {
  id: string;
  name: string;
  providerId: string | null;
  type: string;
  content: string | null;
  directLink: string | null;
  placement: string;
  enabled: boolean;
  archived: boolean;
  priority: number;
  createdAt: string;
  provider?: { id: string; name: string } | null;
};

type Gate = {
  id: string;
  round: number;
  publicToken: string;
  status: string;
  attempts: number;
  createdAt: string;
  verifiedAt: string | null;
  unlockAt: string;
  expiresAt: string;
  user?: { id: string; phone: string; name: string | null };
  session?: { id: string; inviteCode: string; status: string; category: { name: string } | null };
  provider?: { id: string; name: string } | null;
};

type GateEvent = {
  id: string;
  type: string;
  status: string;
  metadata: unknown;
  createdAt: string;
  user?: { id: string; phone: string; name: string | null };
  session?: { id: string; inviteCode: string };
  provider?: { id: string; name: string } | null;
  placement?: string | null;
};

const GATE_COLOR: Record<string, "green" | "orange" | "blue" | "red" | "gray" | "purple"> = {
  VERIFIED: "green",
  PENDING: "orange",
  EXPIRED: "red",
  FAILED: "red",
  CANCELLED: "gray",
};

export default function AdminMonetizationPage() {
  const token = getToken();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState<string | null>(null);

  const [configForm, setConfigForm] = useState({
    enabled: false,
    roundInterval: "3",
    countdownSeconds: "15",
    codeExpiryMinutes: "10",
    linkExpiryMinutes: "30",
    maxAttempts: "5",
    codeLength: "6",
    codeType: "numeric",
    rotation: "priority",
    defaultProviderId: "",
    defaultSnippetId: "",
    directLink: "",
    directLinkEnabled: true,
  });

  const [providerForm, setProviderForm] = useState({
    name: "",
    type: "SCRIPT",
    description: "",
    enabled: true,
    priority: "100",
    configuration: "",
    placements: "",
    revenueModel: "CPA",
    currency: "USD",
    cpmRate: "0",
    cpcRate: "0",
    cpaRate: "0",
    fixedPayoutPerVerification: "0",
  });
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  const [snippetForm, setSnippetForm] = useState({
    name: "",
    providerId: "",
    type: "HTML",
    content: "",
    directLink: "",
    placement: "TOP",
    enabled: true,
    priority: "100",
  });
  const [editingSnippet, setEditingSnippet] = useState<string | null>(null);

  const [gateStatus, setGateStatus] = useState("");
  const [gatePage, setGatePage] = useState(1);
  const [eventType, setEventType] = useState("");
  const [eventPage, setEventPage] = useState(1);

  // ── Queries ──────────────────────────────────────────────

  const configQuery = useQuery<MonetizationConfig>({
    queryKey: ["admin-monet-config"],
    queryFn: () => apiFetch("/api/admin/monetization/config", { token }),
  });

  // Hydrate the settings form once from the server config.
  const configHydrated = useRef(false);
  useEffect(() => {
    if (configQuery.data && !configHydrated.current) {
      configHydrated.current = true;
      setConfigForm({
        enabled: configQuery.data.enabled,
        roundInterval: String(configQuery.data.roundInterval),
        countdownSeconds: String(configQuery.data.countdownSeconds),
        codeExpiryMinutes: String(configQuery.data.codeExpiryMinutes),
        linkExpiryMinutes: String(configQuery.data.linkExpiryMinutes),
        maxAttempts: String(configQuery.data.maxAttempts),
        codeLength: String(configQuery.data.codeLength),
        codeType: configQuery.data.codeType,
        rotation: configQuery.data.rotation,
        defaultProviderId: configQuery.data.defaultProviderId,
        defaultSnippetId: configQuery.data.defaultSnippetId,
        directLink: configQuery.data.directLink,
        directLinkEnabled: configQuery.data.directLinkEnabled,
      });
    }
  }, [configQuery.data]);

  const statsQuery = useQuery<MonetizationStats>({
    queryKey: ["admin-monet-stats"],
    queryFn: () => apiFetch("/api/admin/monetization/stats", { token }),
    refetchInterval: 30_000,
  });

  const providersQuery = useQuery<{ data: AdProvider[]; total: number; totalPages: number }>({
    queryKey: ["admin-monet-providers"],
    queryFn: () => apiFetch("/api/admin/monetization/providers?page=1&limit=50", { token }),
  });

  const typesMetaQuery = useQuery<AdTypesMeta>({
    queryKey: ["admin-monet-types"],
    queryFn: () => apiFetch("/api/admin/monetization/types", { token }),
  });

  const providerStatsQuery = useQuery<ProviderStats>({
    queryKey: ["admin-monet-provider-stats", selectedProviderId],
    queryFn: () => apiFetch(`/api/admin/monetization/providers/${selectedProviderId}/stats`, { token }),
    enabled: Boolean(selectedProviderId),
    refetchInterval: 30_000,
  });

  const providerTestQuery = useQuery<{ valid: boolean; errors: string[]; warnings: string[] }>({
    queryKey: ["admin-monet-provider-test", selectedProviderId],
    queryFn: () => apiFetch(`/api/admin/monetization/providers/${selectedProviderId}/test-config`, { token }),
    enabled: Boolean(selectedProviderId),
  });

  const snippetsQuery = useQuery<{ data: AdSnippet[]; total: number; totalPages: number }>({
    queryKey: ["admin-monet-snippets"],
    queryFn: () => apiFetch("/api/admin/monetization/snippets?includeArchived=true&page=1&limit=50", { token }),
  });

  const gatesQuery = useQuery<{ data: Gate[]; total: number; totalPages: number }>({
    queryKey: ["admin-monet-gates", gateStatus, gatePage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(gatePage), limit: "30" });
      if (gateStatus) params.set("status", gateStatus);
      return apiFetch(`/api/admin/monetization/gates?${params}`, { token });
    },
  });

  const eventsQuery = useQuery<{ data: GateEvent[]; total: number; totalPages: number }>({
    queryKey: ["admin-monet-events", eventType, eventPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(eventPage), limit: "30" });
      if (eventType) params.set("type", eventType);
      return apiFetch(`/api/admin/monetization/events?${params}`, { token });
    },
  });

  // ── Mutations ────────────────────────────────────────────

  const invalidateAll = () => {
    queryClient.invalidateQueries();
  };

  const saveConfigMutation = useMutation({
    mutationFn: () => {
      const body = {
        enabled: configForm.enabled,
        roundInterval: Number(configForm.roundInterval),
        countdownSeconds: Number(configForm.countdownSeconds),
        codeExpiryMinutes: Number(configForm.codeExpiryMinutes),
        linkExpiryMinutes: Number(configForm.linkExpiryMinutes),
        maxAttempts: Number(configForm.maxAttempts),
        codeLength: Number(configForm.codeLength),
        codeType: configForm.codeType,
        rotation: configForm.rotation,
        defaultProviderId: configForm.defaultProviderId,
        defaultSnippetId: configForm.defaultSnippetId,
        directLink: configForm.directLink,
        directLinkEnabled: configForm.directLinkEnabled,
      };
      return apiFetch("/api/admin/monetization/config", { method: "PUT", body, token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-monet-config"] });
      queryClient.invalidateQueries({ queryKey: ["admin-monet-stats"] });
    },
  });

  const createProviderMutation = useMutation({
    mutationFn: () => {
      let configuration: Record<string, unknown> | undefined;
      if (providerForm.configuration.trim()) {
        configuration = JSON.parse(providerForm.configuration) as Record<string, unknown>;
      }
      const placements = providerForm.placements
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      return apiFetch("/api/admin/monetization/providers", {
        method: "POST",
        body: {
          name: providerForm.name,
          type: providerForm.type,
          description: providerForm.description,
          enabled: providerForm.enabled,
          priority: Number(providerForm.priority),
          configuration,
          placements,
          revenueModel: providerForm.revenueModel,
          currency: providerForm.currency,
          cpmRate: Number(providerForm.cpmRate),
          cpcRate: Number(providerForm.cpcRate),
          cpaRate: Number(providerForm.cpaRate),
          fixedPayoutPerVerification: Number(providerForm.fixedPayoutPerVerification),
        },
        token,
      });
    },
    onSuccess: () => {
      invalidateAll();
      resetProviderForm();
    },
  });

  const updateProviderMutation = useMutation({
    mutationFn: () => {
      let configuration: Record<string, unknown> | undefined;
      if (providerForm.configuration.trim()) {
        configuration = JSON.parse(providerForm.configuration) as Record<string, unknown>;
      }
      const placements = providerForm.placements
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      return apiFetch(`/api/admin/monetization/providers/${editingProvider}`, {
        method: "PUT",
        body: {
          name: providerForm.name,
          type: providerForm.type,
          description: providerForm.description,
          enabled: providerForm.enabled,
          priority: Number(providerForm.priority),
          configuration,
          placements,
          revenueModel: providerForm.revenueModel,
          currency: providerForm.currency,
          cpmRate: Number(providerForm.cpmRate),
          cpcRate: Number(providerForm.cpcRate),
          cpaRate: Number(providerForm.cpaRate),
          fixedPayoutPerVerification: Number(providerForm.fixedPayoutPerVerification),
        },
        token,
      });
    },
    onSuccess: () => {
      invalidateAll();
      resetProviderForm();
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/monetization/providers/${id}`, { method: "DELETE", token }),
    onSuccess: () => {
      invalidateAll();
      setSelectedProviderId(null);
    },
  });

  const providerStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { enabled?: boolean; archived?: boolean } }) =>
      apiFetch(`/api/admin/monetization/providers/${id}/status`, { method: "PATCH", body: data, token }),
    onSuccess: () => invalidateAll(),
  });

  const createSnippetMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/monetization/snippets", {
        method: "POST",
        body: {
          name: snippetForm.name,
          providerId: snippetForm.providerId || null,
          type: snippetForm.type,
          content: snippetForm.content,
          directLink: snippetForm.directLink,
          placement: snippetForm.placement,
          enabled: snippetForm.enabled,
          priority: Number(snippetForm.priority),
        },
        token,
      }),
    onSuccess: () => {
      invalidateAll();
      resetSnippetForm();
    },
  });

  const updateSnippetMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/monetization/snippets/${editingSnippet}`, {
        method: "PUT",
        body: {
          name: snippetForm.name,
          providerId: snippetForm.providerId || null,
          type: snippetForm.type,
          content: snippetForm.content,
          directLink: snippetForm.directLink,
          placement: snippetForm.placement,
          enabled: snippetForm.enabled,
          priority: Number(snippetForm.priority),
        },
        token,
      }),
    onSuccess: () => {
      invalidateAll();
      resetSnippetForm();
    },
  });

  const snippetStatusMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { enabled?: boolean; archived?: boolean } }) =>
      apiFetch(`/api/admin/monetization/snippets/${id}/status`, { method: "PATCH", body: data, token }),
    onSuccess: () => invalidateAll(),
  });

  // ── Helpers ──────────────────────────────────────────────

  function resetProviderForm() {
    setEditingProvider(null);
    setProviderForm({
      name: "",
      type: "SCRIPT",
      description: "",
      enabled: true,
      priority: "100",
      configuration: "",
      placements: "",
      revenueModel: "CPA",
      currency: "USD",
      cpmRate: "0",
      cpcRate: "0",
      cpaRate: "0",
      fixedPayoutPerVerification: "0",
    });
  }

  function resetSnippetForm() {
    setEditingSnippet(null);
    setSnippetForm({ name: "", providerId: "", type: "HTML", content: "", directLink: "", placement: "TOP", enabled: true, priority: "100" });
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const c = configQuery.data;
  const s = statsQuery.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Monetization</h1>
        <p className="text-sm text-muted-foreground">
          Manage verification gates, ad providers, ad snippets, and monetization settings
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="providers">Ad Providers</TabsTrigger>
          <TabsTrigger value="snippets">Ad Snippets</TabsTrigger>
          <TabsTrigger value="gates">Verification Gates</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <Card className={c?.enabled ? "border-green-200 bg-green-50" : "border-line"}>
            <CardContent className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${c?.enabled ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">Monetization Engine</p>
                  <p className="font-semibold">{c ? (c.enabled ? "Enabled" : "Disabled") : "Loading…"}</p>
                  {c?.enabled && <p className="text-xs text-muted-foreground">Gating every player every {c.roundInterval} turns</p>}
                </div>
              </div>
              {c?.enabled && (
                <Button variant="outline" size="sm" onClick={() => setTab("settings")}>
                  <Timer className="mr-2 h-4 w-4" /> Configure
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Total Gates</p>
                <p className="mt-1 text-3xl font-bold">{s?.total ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="mt-1 text-3xl font-bold text-orange-600">{s?.pending ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Verified</p>
                <p className="mt-1 text-3xl font-bold text-green-600">{s?.verified ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="mt-1 text-3xl font-bold">{s ? `${s.successRate}%` : "—"}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="mt-1 text-2xl font-bold text-red-600">{s?.expired ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="mt-1 text-2xl font-bold text-red-600">{s?.failed ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Failed Verifications</p>
                <p className="mt-1 text-2xl font-bold">{s?.failedVerifications ?? "—"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Avg. Verify Time</p>
                <p className="mt-1 text-2xl font-bold">{s ? `${s.averageVerificationSeconds}s` : "—"}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Gates Created (last 7 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {s && Object.keys(s.last7Days).length > 0 ? (
                <div className="flex items-end gap-2">
                  {Object.entries(s.last7Days)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([day, count]) => (
                      <div key={day} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-xs font-semibold">{count}</span>
                        <div className="w-full rounded-t-md bg-brand/20" style={{ height: `${Math.max(4, count * 12)}px` }} />
                        <span className="text-[10px] text-muted-foreground">{day.slice(5)}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <EmptyState title="No gates yet" description="Verification gates will appear here once the engine starts running." className="py-8" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Settings ──────────────────────────────────── */}
        <TabsContent value="settings" className="space-y-6">
          <div className="flex items-center justify-end gap-3">
            {saveConfigMutation.isSuccess && <p className="text-sm text-green-600">Settings saved</p>}
            {saveConfigMutation.isError && <p className="text-sm text-red-600">{(saveConfigMutation.error as Error).message}</p>}
            <Button onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending || !c}>
              {saveConfigMutation.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Round-Based Gating</CardTitle>
              <CardDescription>Gates activate periodically during a game. When a player hits the interval, their next turn waits for verification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-line p-4">
                <div>
                  <p className="font-medium">Enable monetization</p>
                  <p className="text-sm text-muted-foreground">Turns off all gates and ad serving when disabled.</p>
                </div>
                <Switch checked={configForm.enabled} onCheckedChange={(v) => setConfigForm({ ...configForm, enabled: Boolean(v) })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Gate every N turns</Label>
                  <Input type="number" min={1} value={configForm.roundInterval} onChange={(e) => setConfigForm({ ...configForm, roundInterval: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Countdown (seconds)</Label>
                  <Input type="number" min={0} value={configForm.countdownSeconds} onChange={(e) => setConfigForm({ ...configForm, countdownSeconds: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Code length</Label>
                  <Input type="number" min={4} max={10} value={configForm.codeLength} onChange={(e) => setConfigForm({ ...configForm, codeLength: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Code type</Label>
                  <select
                    value={configForm.codeType}
                    onChange={(e) => setConfigForm({ ...configForm, codeType: e.target.value as "numeric" | "alphanumeric" })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="numeric">Numeric</option>
                    <option value="alphanumeric">Alphanumeric</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Code expiry (minutes)</Label>
                  <Input type="number" min={1} value={configForm.codeExpiryMinutes} onChange={(e) => setConfigForm({ ...configForm, codeExpiryMinutes: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Link expiry (minutes)</Label>
                  <Input type="number" min={1} value={configForm.linkExpiryMinutes} onChange={(e) => setConfigForm({ ...configForm, linkExpiryMinutes: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Max attempts</Label>
                  <Input type="number" min={1} value={configForm.maxAttempts} onChange={(e) => setConfigForm({ ...configForm, maxAttempts: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Ad rotation</Label>
                  <select
                    value={configForm.rotation}
                    onChange={(e) => setConfigForm({ ...configForm, rotation: e.target.value as "priority" | "random" })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="priority">Priority</option>
                    <option value="random">Random</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Sponsorship / Direct Link</CardTitle>
              <CardDescription>Show a sponsor button on the verification page instead of (or alongside) ad snippets.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Direct link URL</Label>
                  <Input placeholder="https://sponsor.example.com" value={configForm.directLink} onChange={(e) => setConfigForm({ ...configForm, directLink: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Default provider (ID)</Label>
                  <Input placeholder="Optional provider ID" value={configForm.defaultProviderId} onChange={(e) => setConfigForm({ ...configForm, defaultProviderId: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Default snippet (ID)</Label>
                  <Input placeholder="Optional snippet ID" value={configForm.defaultSnippetId} onChange={(e) => setConfigForm({ ...configForm, defaultSnippetId: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-line p-4">
                <div>
                  <p className="font-medium">Show direct link button</p>
                  <p className="text-sm text-muted-foreground">Falls back to the first snippet's link when no direct link is set.</p>
                </div>
                <Switch
                  checked={configForm.directLinkEnabled}
                  onCheckedChange={(v) => setConfigForm({ ...configForm, directLinkEnabled: Boolean(v) })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Ad Providers ──────────────────────────────── */}
        <TabsContent value="providers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> {editingProvider ? "Edit Ad Provider" : "New Ad Provider"}
              </CardTitle>
              <CardDescription>Providers are the sources of ad inventory. Delete is disabled — archive instead.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input placeholder="e.g. SponsorCo" value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <select
                    value={providerForm.type}
                    onChange={(e) => setProviderForm({ ...providerForm, type: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {(typesMetaQuery.data?.providerTypes ?? ["SCRIPT", "DIRECT_LINK", "REDIRECT", "SNIPPET", "API", "CPA", "VERIFICATION", "OTHER"]).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Priority (lower = first)</Label>
                  <Input type="number" min={0} value={providerForm.priority} onChange={(e) => setProviderForm({ ...providerForm, priority: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label>Description</Label>
                  <Input placeholder="Optional description" value={providerForm.description} onChange={(e) => setProviderForm({ ...providerForm, description: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label>Placements (comma-separated, e.g. GATE,HOME_INLINE)</Label>
                  <Input placeholder="GATE,HOME_INLINE,CONTRIBUTION_PAGE" value={providerForm.placements} onChange={(e) => setProviderForm({ ...providerForm, placements: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Revenue model</Label>
                  <select
                    value={providerForm.revenueModel}
                    onChange={(e) => setProviderForm({ ...providerForm, revenueModel: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {["CPM", "CPC", "CPA", "FIXED"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input maxLength={8} value={providerForm.currency} onChange={(e) => setProviderForm({ ...providerForm, currency: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CPM rate</Label>
                  <Input type="number" min={0} step="0.01" value={providerForm.cpmRate} onChange={(e) => setProviderForm({ ...providerForm, cpmRate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CPC rate</Label>
                  <Input type="number" min={0} step="0.01" value={providerForm.cpcRate} onChange={(e) => setProviderForm({ ...providerForm, cpcRate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>CPA rate</Label>
                  <Input type="number" min={0} step="0.01" value={providerForm.cpaRate} onChange={(e) => setProviderForm({ ...providerForm, cpaRate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Fixed payout / verification</Label>
                  <Input type="number" min={0} step="0.01" value={providerForm.fixedPayoutPerVerification} onChange={(e) => setProviderForm({ ...providerForm, fixedPayoutPerVerification: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label>Configuration (JSON)</Label>
                  <textarea
                    placeholder='{ "script": "…", "callbackSecret": "…" }'
                    rows={3}
                    value={providerForm.configuration}
                    onChange={(e) => setProviderForm({ ...providerForm, configuration: e.target.value })}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={providerForm.enabled} onCheckedChange={(v) => setProviderForm({ ...providerForm, enabled: Boolean(v) })} />
                  <Label>Enabled</Label>
                </div>
                <div className="flex gap-2">
                  {editingProvider && (
                    <Button variant="outline" onClick={resetProviderForm}>Cancel</Button>
                  )}
                  <Button
                    onClick={() => {
                      if (!providerForm.name) return;
                      if (editingProvider) updateProviderMutation.mutate();
                      else createProviderMutation.mutate();
                    }}
                    disabled={!providerForm.name || createProviderMutation.isPending || updateProviderMutation.isPending}
                  >
                    {editingProvider ? "Update Provider" : "Create Provider"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {providersQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : !(providersQuery.data?.data ?? []).length ? (
                <EmptyState title="No providers" description="Create your first ad provider above." className="py-12" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Revenue model</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Snippets</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(providersQuery.data?.data ?? []).map((p) => (
                      <TableRow key={p.id} className={p.archived ? "opacity-50" : ""}>
                        <TableCell>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.description || "—"}</div>
                        </TableCell>
                        <TableCell><Badge variant="gray">{p.type}</Badge></TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">{p.revenueModel ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{(p.placements as string[] | null)?.join(", ") ?? "All"}</div>
                        </TableCell>
                        <TableCell>{p.priority}</TableCell>
                        <TableCell>{p._count?.snippets ?? 0}</TableCell>
                        <TableCell>
                          <Badge variant={p.enabled ? (p.archived ? "gray" : "green") : "red"}>
                            {p.archived ? "Archived" : p.enabled ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={p.archived}
                              onClick={() => {
                                const placements = Array.isArray(p.placements) ? (p.placements as string[]).join(",") : "";
                                setEditingProvider(p.id);
                                setProviderForm({
                                  name: p.name,
                                  type: p.type,
                                  description: p.description ?? "",
                                  enabled: p.enabled,
                                  priority: String(p.priority),
                                  configuration: p.configuration ? JSON.stringify(p.configuration, null, 2) : "",
                                  placements,
                                  revenueModel: p.revenueModel ?? "CPA",
                                  currency: p.currency ?? "USD",
                                  cpmRate: String(p.cpmRate ?? 0),
                                  cpcRate: String(p.cpcRate ?? 0),
                                  cpaRate: String(p.cpaRate ?? 0),
                                  fixedPayoutPerVerification: String(p.fixedPayoutPerVerification ?? 0),
                                });
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedProviderId(selectedProviderId === p.id ? null : p.id)}
                            >
                              <Activity className="h-4 w-4" />
                            </Button>
                            {!p.archived && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => providerStatusMutation.mutate({ id: p.id, data: { enabled: !p.enabled } })}
                              >
                                <ToggleLeft className="h-4 w-4" />
                              </Button>
                            )}
                            {!p.archived && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  if (confirm(`Archive provider "${p.name}"?`)) providerStatusMutation.mutate({ id: p.id, data: { archived: true } });
                                }}
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            )}
                            {!p.archived && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  if (confirm(`Delete provider "${p.name}"? Providers with history are archived instead.`)) deleteProviderMutation.mutate(p.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            {selectedProviderId === p.id && !p.archived && (
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedProviderId(null); }}>
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {selectedProviderId && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Provider performance</CardTitle>
                <CardDescription>Anonymous, provider-agnostic performance + configuration check for this provider.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {providerStatsQuery.isLoading ? (
                  <Skeleton className="h-24 w-full rounded-xl" />
                ) : providerStatsQuery.data ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Impressions</p>
                        <p className="mt-1 text-2xl font-bold">{providerStatsQuery.data.impressions}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Clicks</p>
                        <p className="mt-1 text-2xl font-bold">{providerStatsQuery.data.clicks} <span className="text-xs font-normal text-muted-foreground">CTR {providerStatsQuery.data.ctr}%</span></p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Conversions</p>
                        <p className="mt-1 text-2xl font-bold">{providerStatsQuery.data.conversions} <span className="text-xs font-normal text-muted-foreground">CVR {providerStatsQuery.data.conversionRate}%</span></p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Verified gates</p>
                        <p className="mt-1 text-2xl font-bold">{providerStatsQuery.data.verifiedGates}</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-xl border border-line p-4">
                        <p className="text-sm text-muted-foreground">Estimated revenue</p>
                        <p className="mt-1 text-xl font-bold text-orange-600">{providerStatsQuery.data.revenue.estimated.toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl border border-line p-4">
                        <p className="text-sm text-muted-foreground">Confirmed revenue</p>
                        <p className="mt-1 text-xl font-bold text-green-600">{providerStatsQuery.data.revenue.confirmed.toFixed(2)}</p>
                      </div>
                      <div className="rounded-xl border border-line p-4">
                        <p className="text-sm text-muted-foreground">Paid</p>
                        <p className="mt-1 text-xl font-bold">{providerStatsQuery.data.revenue.paid.toFixed(2)}</p>
                      </div>
                    </div>
                  </>
                ) : null}

                {providerTestQuery.data && (
                  <div className={`rounded-xl border p-4 ${providerTestQuery.data.valid ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                    <p className="font-medium">{providerTestQuery.data.valid ? "Configuration looks valid" : "Configuration needs attention"}</p>
                    {providerTestQuery.data.warnings.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-sm text-orange-700">
                        {providerTestQuery.data.warnings.map((w) => <li key={w}>{w}</li>)}
                      </ul>
                    )}
                    {providerTestQuery.data.errors.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-sm text-red-700">
                        {providerTestQuery.data.errors.map((e) => <li key={e}>{e}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Ad Snippets ───────────────────────────────── */}
        <TabsContent value="snippets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode2 className="h-4 w-4" /> {editingSnippet ? "Edit Ad Snippet" : "New Ad Snippet"}
              </CardTitle>
              <CardDescription>Snippets are the HTML/markup blocks served on the verification page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input placeholder="e.g. Banner 468x60" value={snippetForm.name} onChange={(e) => setSnippetForm({ ...snippetForm, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <select
                    value={snippetForm.providerId}
                    onChange={(e) => setSnippetForm({ ...snippetForm, providerId: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">— None —</option>
                    {(providersQuery.data?.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <select
                    value={snippetForm.type}
                    onChange={(e) => setSnippetForm({ ...snippetForm, type: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="HTML">HTML</option>
                    <option value="IMAGE">Image</option>
                    <option value="TEXT">Text</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Placement</Label>
                  <select
                    value={snippetForm.placement}
                    onChange={(e) => setSnippetForm({ ...snippetForm, placement: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="TOP">Top</option>
                    <option value="BOTTOM">Bottom</option>
                    <option value="CENTER">Center</option>
                    <option value="SIDEBAR">Sidebar</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Input type="number" min={0} value={snippetForm.priority} onChange={(e) => setSnippetForm({ ...snippetForm, priority: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label>Direct link</Label>
                  <Input placeholder="https://…" value={snippetForm.directLink} onChange={(e) => setSnippetForm({ ...snippetForm, directLink: e.target.value })} />
                </div>
                <div className="space-y-2 sm:col-span-3">
                  <Label>Content (HTML)</Label>
                  <textarea
                    placeholder="<div>…ad markup…</div>"
                    rows={5}
                    value={snippetForm.content}
                    onChange={(e) => setSnippetForm({ ...snippetForm, content: e.target.value })}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={snippetForm.enabled} onCheckedChange={(v) => setSnippetForm({ ...snippetForm, enabled: Boolean(v) })} />
                  <Label>Enabled</Label>
                </div>
                <div className="flex gap-2">
                  {editingSnippet && (
                    <Button variant="outline" onClick={resetSnippetForm}>Cancel</Button>
                  )}
                  <Button
                    onClick={() => {
                      if (!snippetForm.name) return;
                      if (editingSnippet) updateSnippetMutation.mutate();
                      else createSnippetMutation.mutate();
                    }}
                    disabled={!snippetForm.name || createSnippetMutation.isPending || updateSnippetMutation.isPending}
                  >
                    {editingSnippet ? "Update Snippet" : "Create Snippet"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {snippetsQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : !(snippetsQuery.data?.data ?? []).length ? (
                <EmptyState title="No snippets" description="Create your first ad snippet above." className="py-12" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Placement</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(snippetsQuery.data?.data ?? []).map((sp) => (
                      <TableRow key={sp.id} className={sp.archived ? "opacity-50" : ""}>
                        <TableCell>
                          <div className="font-medium">{sp.name}</div>
                          {sp.directLink && <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Link2 className="h-3 w-3" />
                            <span className="max-w-[180px] truncate">{sp.directLink}</span>
                          </div>}
                        </TableCell>
                        <TableCell>{sp.provider?.name ?? "—"}</TableCell>
                        <TableCell><Badge variant="gray">{sp.type}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{sp.placement}</TableCell>
                        <TableCell>
                          <Badge variant={sp.enabled ? (sp.archived ? "gray" : "green") : "red"}>
                            {sp.archived ? "Archived" : sp.enabled ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={sp.archived}
                              onClick={() => {
                                setEditingSnippet(sp.id);
                                setSnippetForm({
                                  name: sp.name,
                                  providerId: sp.providerId ?? "",
                                  type: sp.type,
                                  content: sp.content ?? "",
                                  directLink: sp.directLink ?? "",
                                  placement: sp.placement,
                                  enabled: sp.enabled,
                                  priority: String(sp.priority),
                                });
                              }}
                            >
                              Edit
                            </Button>
                            {!sp.archived && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => snippetStatusMutation.mutate({ id: sp.id, data: { enabled: !sp.enabled } })}
                              >
                                <ToggleLeft className="h-4 w-4" />
                              </Button>
                            )}
                            {!sp.archived && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  if (confirm(`Archive snippet "${sp.name}"?`)) snippetStatusMutation.mutate({ id: sp.id, data: { archived: true } });
                                }}
                              >
                                <Archive className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Gates ─────────────────────────────────────── */}
        <TabsContent value="gates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> Verification Gates</CardTitle>
              <CardDescription>Every round-based verification a player received.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-2">
                {["", "PENDING", "VERIFIED", "EXPIRED", "FAILED", "CANCELLED"].map((st) => (
                  <button
                    key={st}
                    onClick={() => { setGateStatus(st); setGatePage(1); }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      gateStatus === st ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
                    }`}
                  >
                    {st || "All"}
                  </button>
                ))}
              </div>

              {gatesQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                </div>
              ) : !(gatesQuery.data?.data ?? []).length ? (
                <EmptyState title="No gates" description="Verification gates will appear here." className="py-12" />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Player</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Round</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Attempts</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Token</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(gatesQuery.data?.data ?? []).map((g) => (
                        <TableRow key={g.id}>
                          <TableCell>
                            <div className="font-medium">{g.user?.name ?? "Player"}</div>
                            <div className="font-mono text-xs text-muted-foreground">{g.user ? maskPhone(g.user.phone) : "—"}</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-xs font-semibold">{g.session?.inviteCode ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{g.session?.category?.name ?? ""}</div>
                          </TableCell>
                          <TableCell>#{g.round}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{g.provider?.name ?? "—"}</TableCell>
                          <TableCell>{g.attempts}</TableCell>
                          <TableCell><Badge variant={GATE_COLOR[g.status] ?? "gray"}>{g.status}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{timeAgo(g.createdAt)}</TableCell>
                          <TableCell>
                            <button
                              onClick={() => copyToClipboard(g.publicToken, g.id)}
                              className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                            >
                              {g.publicToken.slice(0, 10)}…
                              {copied === g.id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {(gatesQuery.data?.totalPages ?? 0) > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Page {gatePage} of {gatesQuery.data?.totalPages}</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={gatePage <= 1} onClick={() => setGatePage(gatePage - 1)}>Previous</Button>
                        <Button variant="outline" size="sm" disabled={gatePage >= (gatesQuery.data?.totalPages ?? 1)} onClick={() => setGatePage(gatePage + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Events ────────────────────────────────────── */}
        <TabsContent value="events" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Monetization Events</CardTitle>
              <CardDescription>Basic event feed powering the analytics foundation.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={() => { setEventType(""); setEventPage(1); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${!eventType ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"}`}
                >
                  All
                </button>
                {["GATE_CREATED", "LINK_OPENED", "CODE_REQUESTED", "CODE_GENERATED", "VERIFICATION_ATTEMPT", "VERIFICATION_SUCCESS", "VERIFICATION_FAILED", "GATE_EXPIRED", "GATE_CANCELLED", "IMPRESSION", "CLICK", "CONVERSION", "VERIFICATION", "CALLBACK"].map((t) => (
                  <button
                    key={t}
                    onClick={() => { setEventType(t); setEventPage(1); }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      eventType === t ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {eventsQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                </div>
              ) : !(eventsQuery.data?.data ?? []).length ? (
                <EmptyState title="No events" description="Monetization events will appear here." className="py-12" />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Player</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Provider / Placement</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(eventsQuery.data?.data ?? []).map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell><Badge variant="purple">{ev.type}</Badge></TableCell>
                          <TableCell>
                            <div className="font-medium">{ev.user?.name ?? "—"}</div>
                            <div className="font-mono text-xs text-muted-foreground">{ev.user ? maskPhone(ev.user.phone) : ""}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{ev.session?.inviteCode ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {ev.provider?.name ? ev.provider.name : "—"}
                            {ev.placement ? <span className="text-muted-foreground"> / {ev.placement}</span> : null}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {ev.metadata && typeof ev.metadata === "object" ? JSON.stringify(ev.metadata).slice(0, 80) : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDateTime(ev.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {(eventsQuery.data?.totalPages ?? 0) > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">Page {eventPage} of {eventsQuery.data?.totalPages}</p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={eventPage <= 1} onClick={() => setEventPage(eventPage - 1)}>Previous</Button>
                        <Button variant="outline" size="sm" disabled={eventPage >= (eventsQuery.data?.totalPages ?? 1)} onClick={() => setEventPage(eventPage + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}