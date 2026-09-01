"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";
import { Plus, Pencil, Trash2, RefreshCw, Building2, LayoutGrid, TrendingUp, BookOpen } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";

// ---- Types -----------------------------------------------------------

type AdProvider = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  enabled: boolean;
  archived: boolean;
  priority: number;
  configuration: unknown;
  revenueModel: string;
  currency: string;
  cpmRate: number;
  cpcRate: number;
  cpaRate: number;
  fixedPayoutPerVerification: number;
  createdAt: string;
};

type AdPlacement = {
  id: string;
  key: string;
  name: string | null;
  description: string | null;
  providerId: string | null;
  provider: { id: string; name: string; type: string; enabled: boolean; archived: boolean } | null;
  providerPlacementId: string | null;
  format: string | null;
  enabled: boolean;
  priority: number;
  createdAt: string;
};

type TypesMeta = { providerTypes: string[]; placements: string[]; eventTypes: string[] };

type PerformanceRow = {
  placement: string;
  name: string | null;
  enabled: boolean;
  provider: { id: string; name: string; type: string } | null;
  impressions: number;
  clicks: number;
  conversions: number;
  verifications: number;
  revenue: { estimated: number; confirmed: number };
};

type PerformanceReport = {
  summary: { impressions: number; clicks: number; conversions: number; verifications: number; estimated: number; confirmed: number };
  placements: PerformanceRow[];
  providers: {
    providerId: string;
    name: string;
    type: string;
    enabled: boolean;
    impressions: number;
    clicks: number;
    conversions: number;
    verifications: number;
    ctr: number;
    revenue: { estimated: number; confirmed: number };
  }[];
};

// ---- Hardcoded provider catalog (for reference/docs only) -------------

const AD_PROVIDER_CATALOG: {
  name: string;
  type: string;
  summary: string;
  placements: string[];
  setup: string[];
  configKeys: string;
}[] = [
  {
    name: "Google AdSense",
    type: "SCRIPT",
    summary: "Display/auto ads via a publisher tag. Best for content placements.",
    placements: ["HOME_INLINE", "FAQ_BOTTOM", "RESULT_PAGE"],
    setup: [
      "Create an AdSense ad unit in your publisher account.",
      "Copy the generated <amp-ad>/<ins> snippet.",
      "Add a provider with type SCRIPT and paste the snippet into configuration.html.",
    ],
    configKeys: "{\n  \"html\": \"<ins class=... data-ad-slot=...></ins>\"\n}",
  },
  {
    name: "Google Ad Manager (GAM)",
    type: "SCRIPT",
    summary: "Publisher-specific ad server with programmatic + direct deals.",
    placements: ["HOME_INLINE", "FAQ_BOTTOM"],
    setup: [
      "Create an ad unit and a display creative in GAM.",
      "Copy the GPT (googletag) tag.",
      "Add a provider with type SCRIPT and paste the GPT tag into configuration.html.",
    ],
    configKeys: "{\n  \"html\": \"<script>googletag.../script> <div id=div-gpt-ad-...></div>\"\n}",
  },
  {
    name: "Meta Audience Network",
    type: "SCRIPT",
    summary: "Native/adaptive banner + interstitial via the Facebook SDK ad tag.",
    placements: ["HOME_INLINE", "RESULT_PAGE"],
    setup: [
      "Register your app in Meta for Developers and enable Audience Network.",
      "Create an ad placement ID.",
      "Add a provider with type SCRIPT and configuration.html set to your ad unit tag.",
    ],
    configKeys: "{\n  \"html\": \"<div class=fan-ad data-placement-id=...></div>\"\n}",
  },
  {
    name: "Direct Sponsor",
    type: "DIRECT_LINK",
    summary: "A single sponsor advertiser link (redirect) — no external network.",
    placements: ["GATE", "RESULT_PAGE"],
    setup: [
      "Agree on a monthly/fixed or CPA deal with the sponsor.",
      "Add a provider with type DIRECT_LINK and set configuration.url to the destination.",
      "Assign a paid placement (e.g. GATE) to this provider.",
    ],
    configKeys: "{\n  \"url\": \"https://sponsor.example.com?ref=400faqs\",\n  \"redirect\": true\n}",
  },
  {
    name: "CPA / Affiliate Network",
    type: "CPA",
    summary: "Cost-per-action: cash or credits are paid when a user completes an action.",
    placements: ["GATE", "CONTRIBUTION_PAGE"],
    setup: [
      "Join an affiliate/CPA network and get an action/conversion link.",
      "Add a provider with type CPA and configure the action URL + cpaRate.",
      "Events route through the monetization gate; conversions credit the ledger.",
    ],
    configKeys: "{\n  \"url\": \"https://network.example.com/offer/123\",\n  \"eventCallbackToken\": \"...\"\n}",
  },
  {
    name: "Verification / In-App Offer",
    type: "VERIFICATION",
    summary: "A unit that unlocks a WhatsApp verification gate for the player.",
    placements: ["GATE"],
    setup: [
      "Configure the offer that verifies the player (ad view, quiz, signup).",
      "Add a provider with type VERIFICATION and fixedPayoutPerVerification.",
      "Player completes the verification gate; the ledger is credited automatically.",
    ],
    configKeys: "{\n  \"gateId\": \"...\",\n  \"payoutCurrency\": \"USD\"\n}",
  },
];

// ---- Form default builders -------------------------------------------

const emptyProvider: Record<string, unknown> = {
  name: "",
  type: "SCRIPT",
  description: "",
  enabled: true,
  priority: 100,
  revenueModel: "CPA",
  currency: "USD",
  cpmRate: 0,
  cpcRate: 0,
  cpaRate: 0,
  fixedPayoutPerVerification: 0,
  configuration: {},
};

function providerToForm(p: AdProvider): Record<string, unknown> {
  return { ...p };
}

export default function AdsAdminPage() {
  const qc = useQueryClient();
  const token = getToken();
  const [tab, setTab] = useState("providers");

  const { data: meta } = useQuery({ queryKey: ["ads-types"], queryFn: () => apiFetch<TypesMeta>("/api/admin/ads/types", { token }) });

  const { data: providers, isLoading: providersLoading, refetch: refreshProviders } = useQuery({
    queryKey: ["ads-providers"],
    queryFn: () => apiFetch<AdProvider[]>("/api/admin/ads/providers?limit=1000", { token }),
  });

  const { data: placements, isLoading: placementsLoading, refetch: refreshPlacements } = useQuery({
    queryKey: ["ads-placements"],
    queryFn: () => apiFetch<AdPlacement[]>("/api/admin/ads/placements?limit=1000", { token }),
  });

  const { data: report, isLoading: reportLoading, refetch: refreshReport } = useQuery({
    queryKey: ["ads-performance"],
    queryFn: () => apiFetch<PerformanceReport>("/api/admin/ads/performance", { token }),
  });

  const invalidate = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["ads-providers"] }), qc.invalidateQueries({ queryKey: ["ads-placements"] }), qc.invalidateQueries({ queryKey: ["ads-performance"] })]);
  };

  // ---- Provider mutations -------------------------------------------

  const [providerModal, setProviderModal] = useState<{ open: boolean; editing: AdProvider | null }>({ open: false, editing: null });

  const saveProvider = useMutation({
    mutationFn: async (vals: Record<string, unknown>) => {
      if (providerModal.editing) {
        return apiFetch(`/api/admin/ads/providers/${providerModal.editing.id}`, { method: "PUT", body: vals, token });
      }
      return apiFetch("/api/admin/ads/providers", { method: "POST", body: vals, token });
    },
    onSuccess: async () => {
      toast.success(providerModal.editing ? "Provider updated" : "Provider created");
      setProviderModal({ open: false, editing: null });
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleProvider = useMutation({
    mutationFn: (p: AdProvider) => apiFetch(`/api/admin/ads/providers/${p.id}/status`, { method: "PATCH", body: { enabled: !p.enabled }, token }),
    onSuccess: async () => {
      toast.success("Provider status updated");
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteProvider = useMutation({
    mutationFn: (p: AdProvider) => apiFetch(`/api/admin/ads/providers/${p.id}`, { method: "DELETE", token }),
    onSuccess: async () => {
      toast.success("Provider deleted (or archived if it has history)");
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Placement mutations ------------------------------------------

  const [placementModal, setPlacementModal] = useState<{ open: boolean; editing: AdPlacement | null }>({ open: false, editing: null });

  const savePlacement = useMutation({
    mutationFn: async (vals: Record<string, unknown>) => {
      if (placementModal.editing) {
        return apiFetch(`/api/admin/ads/placements/${placementModal.editing.id}`, { method: "PUT", body: vals, token });
      }
      return apiFetch("/api/admin/ads/placements", { method: "POST", body: vals, token });
    },
    onSuccess: async () => {
      toast.success(placementModal.editing ? "Placement updated" : "Placement created");
      setPlacementModal({ open: false, editing: null });
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePlacement = useMutation({
    mutationFn: (p: AdPlacement) => apiFetch(`/api/admin/ads/placements/${p.id}`, { method: "PUT", body: { enabled: !p.enabled }, token }),
    onSuccess: async () => {
      toast.success("Placement status updated");
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePlacement = useMutation({
    mutationFn: (p: AdPlacement) => apiFetch(`/api/admin/ads/placements/${p.id}`, { method: "DELETE", token }),
    onSuccess: async () => {
      toast.success("Placement deleted (or disabled if it has history)");
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ad Providers</h1>
          <p className="text-sm text-muted-foreground">Provider-agnostic ad & monetization configuration.</p>
        </div>
        <Button variant="outline" onClick={invalidate} className="gap-2">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="providers" className="gap-2">
            <Building2 className="h-4 w-4" /> Providers
          </TabsTrigger>
          <TabsTrigger value="placements" className="gap-2">
            <LayoutGrid className="h-4 w-4" /> Placements
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2">
            <TrendingUp className="h-4 w-4" /> Performance
          </TabsTrigger>
          <TabsTrigger value="catalog" className="gap-2">
            <BookOpen className="h-4 w-4" /> Catalog & Docs
          </TabsTrigger>
        </TabsList>

        {/* Providers */}
        <TabsContent value="providers" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setProviderModal({ open: true, editing: null })} className="gap-2">
              <Plus className="h-4 w-4" /> Add provider
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providersLoading ? (
                    <ProvRows count={4} />
                  ) : !providers || providers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <EmptyState title="No providers yet" description="Add an ad provider to start monetizing placements." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    providers.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <p className="font-medium">{p.name}</p>
                          {p.description ? <p className="text-xs text-muted-foreground">{p.description}</p> : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant="gray">{p.type}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">
                            {p.revenueModel}/{p.currency}
                          </span>
                        </TableCell>
                        <TableCell>{p.priority}</TableCell>
                        <TableCell>
                          <Switch checked={p.enabled} onCheckedChange={() => toggleProvider.mutate(p)} disabled={toggleProvider.isPending} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setProviderModal({ open: true, editing: p })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => deleteProvider.mutate(p)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Placements */}
        <TabsContent value="placements" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setPlacementModal({ open: true, editing: null })} className="gap-2">
              <Plus className="h-4 w-4" /> Add placement
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Placement</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Zone / Link</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {placementsLoading ? (
                    <ProvRows count={4} />
                  ) : !placements || placements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <EmptyState title="No placements yet" description="Create a placement and assign a provider to it." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    placements.map((pl) => (
                      <TableRow key={pl.id}>
                        <TableCell>
                          <p className="font-medium">{pl.key}</p>
                          {pl.name && pl.name !== pl.key ? <p className="text-xs text-muted-foreground">{pl.name}</p> : null}
                        </TableCell>
                        <TableCell>{pl.provider ? pl.provider.name : <span className="text-xs text-muted-foreground">Unassigned</span>}</TableCell>
                        <TableCell>
                          <Badge variant="gray">{pl.format ?? pl.provider?.type ?? "—"}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">{pl.providerPlacementId ?? "—"}</TableCell>
                        <TableCell>
                          <Switch checked={pl.enabled} onCheckedChange={() => togglePlacement.mutate(pl)} disabled={togglePlacement.isPending} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => setPlacementModal({ open: true, editing: pl })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600" onClick={() => deletePlacement.mutate(pl)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="space-y-4">
          {reportLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : report ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard label="Impressions" value={report.summary.impressions.toLocaleString()} />
                <StatCard label="Clicks" value={report.summary.clicks.toLocaleString()} />
                <StatCard label="Conversions" value={report.summary.conversions.toLocaleString()} />
                <StatCard label="Est. revenue" value={fmtMoney(report.summary.estimated)} />
                <StatCard label="Confirmed" value={fmtMoney(report.summary.confirmed)} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Placement performance</CardTitle>
                  <CardDescription>Which placement is making money.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Placement</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Impr.</TableHead>
                        <TableHead>Clicks</TableHead>
                        <TableHead>Conv.</TableHead>
                        <TableHead className="text-right">Est.</TableHead>
                        <TableHead className="text-right">Confirmed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.placements.map((r) => (
                        <TableRow key={r.placement}>
                          <TableCell className="font-medium">{r.placement}</TableCell>
                          <TableCell>{r.provider?.name ?? "—"}</TableCell>
                          <TableCell>{r.impressions.toLocaleString()}</TableCell>
                          <TableCell>{r.clicks.toLocaleString()}</TableCell>
                          <TableCell>{r.conversions.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{fmtMoney(r.revenue.estimated)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(r.revenue.confirmed)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Provider performance</CardTitle>
                  <CardDescription>Which provider is driving value.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Impr.</TableHead>
                        <TableHead>Clicks</TableHead>
                        <TableHead>CTR</TableHead>
                        <TableHead className="text-right">Est.</TableHead>
                        <TableHead className="text-right">Confirmed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.providers.map((r) => (
                        <TableRow key={r.providerId}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>
                            <Badge variant="gray">{r.type}</Badge>
                          </TableCell>
                          <TableCell>{r.impressions.toLocaleString()}</TableCell>
                          <TableCell>{r.clicks.toLocaleString()}</TableCell>
                          <TableCell>{r.ctr}%</TableCell>
                          <TableCell className="text-right">{fmtMoney(r.revenue.estimated)}</TableCell>
                          <TableCell className="text-right">{fmtMoney(r.revenue.confirmed)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState title="No performance data" description="Serve some ads to see provider/placement performance." />
          )}
        </TabsContent>

        {/* Catalog & Docs */}
        <TabsContent value="catalog" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {AD_PROVIDER_CATALOG.map((entry) => (
              <Card key={entry.name}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" /> {entry.name}
                      </CardTitle>
                      <CardDescription>{entry.summary}</CardDescription>
                    </div>
                    <Badge variant="gray">{entry.type}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="mb-1 font-medium text-muted-foreground">Recommended placements</p>
                    <div className="flex flex-wrap gap-1.5">
                      {entry.placements.map((pl) => (
                        <Badge key={pl} variant="outline">{pl}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-muted-foreground">Setup</p>
                    <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                      {entry.setup.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <p className="mb-1 font-medium text-muted-foreground">Configuration keys</p>
                    <pre className="overflow-x-auto rounded-lg bg-muted p-2 font-mono text-xs">{entry.configKeys}</pre>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {providerModal.open && (
        <ProviderDialog
          meta={meta}
          editing={providerModal.editing}
          saving={saveProvider.isPending}
          onSave={saveProvider.mutate}
          onClose={() => setProviderModal({ open: false, editing: null })}
        />
      )}
      {placementModal.open && (
        <PlacementDialog
          meta={meta}
          providers={providers ?? []}
          editing={placementModal.editing}
          saving={savePlacement.isPending}
          onSave={savePlacement.mutate}
          onClose={() => setPlacementModal({ open: false, editing: null })}
        />
      )}
    </div>
  );
}

// ---- Dialog: Provider ------------------------------------------------

function ProviderDialog({
  meta,
  editing,
  saving,
  onSave,
  onClose,
}: {
  meta?: TypesMeta;
  editing: AdProvider | null;
  saving: boolean;
  onSave: (vals: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>(() => (editing ? providerToForm(editing) : { ...emptyProvider }));
  const [configText, setConfigText] = useState(() =>
    editing && editing.configuration && typeof editing.configuration === "object" ? JSON.stringify(editing.configuration, null, 2) : "{}"
  );

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    let config: Record<string, unknown> = {};
    try {
      config = configText.trim() ? JSON.parse(configText) : {};
    } catch {
      toast.error("Configuration must be valid JSON");
      return;
    }
    onSave({
      name: form.name,
      type: form.type,
      description: form.description ?? "",
      enabled: !!form.enabled,
      priority: Number(form.priority ?? 100),
      revenueModel: form.revenueModel,
      currency: form.currency,
      cpmRate: Number(form.cpmRate ?? 0),
      cpcRate: Number(form.cpcRate ?? 0),
      cpaRate: Number(form.cpaRate ?? 0),
      fixedPayoutPerVerification: Number(form.fixedPayoutPerVerification ?? 0),
      configuration: config,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit provider" : "Add provider"}</DialogTitle>
          <DialogDescription>Configure a generic ad provider. Secrets stay server-side.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input value={(form.name as string) ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Acme Direct" />
            </Field>
            <Field label="Type">
              <Select value={(form.type as string) ?? "SCRIPT"} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(meta?.providerTypes ?? ["SCRIPT", "DIRECT_LINK", "REDIRECT", "SNIPPET", "API", "CPA", "VERIFICATION", "OTHER"]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Description">
            <Input value={(form.description as string) ?? ""} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Revenue model">
              <Select value={(form.revenueModel as string) ?? "CPA"} onValueChange={(v) => set("revenueModel", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["CPM", "CPC", "CPA", "FIXED"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Currency">
              <Input value={(form.currency as string) ?? "USD"} onChange={(e) => set("currency", e.target.value)} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CPM rate">
              <Input type="number" value={(form.cpmRate as number) ?? 0} onChange={(e) => set("cpmRate", Number(e.target.value))} />
            </Field>
            <Field label="CPC rate">
              <Input type="number" value={(form.cpcRate as number) ?? 0} onChange={(e) => set("cpcRate", Number(e.target.value))} />
            </Field>
            <Field label="CPA rate">
              <Input type="number" value={(form.cpaRate as number) ?? 0} onChange={(e) => set("cpaRate", Number(e.target.value))} />
            </Field>
            <Field label="Fixed payout / verification">
              <Input type="number" value={(form.fixedPayoutPerVerification as number) ?? 0} onChange={(e) => set("fixedPayoutPerVerification", Number(e.target.value))} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Field label="Priority">
              <Input type="number" value={(form.priority as number) ?? 100} onChange={(e) => set("priority", Number(e.target.value))} />
            </Field>
            <label className="flex items-center gap-2 pt-5 text-sm">
              <Switch checked={!!form.enabled} onCheckedChange={(v) => set("enabled", v)} /> Enabled
            </label>
          </div>
          <Field label="Configuration (JSON)">
            <Textarea rows={7} value={configText} onChange={(e) => setConfigText(e.target.value)} className="font-mono text-xs" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? "Save changes" : "Create provider"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Dialog: Placement -----------------------------------------------

function PlacementDialog({
  meta,
  providers,
  editing,
  saving,
  onSave,
  onClose,
}: {
  meta?: TypesMeta;
  providers: AdProvider[];
  editing: AdPlacement | null;
  saving: boolean;
  onSave: (vals: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>(() => ({
    key: editing?.key ?? "",
    name: editing?.name ?? "",
    description: editing?.description ?? "",
    providerId: editing?.providerId ?? "",
    providerPlacementId: editing?.providerPlacementId ?? "",
    format: editing?.format ?? "",
    enabled: editing?.enabled ?? true,
    priority: editing?.priority ?? 100,
  }));

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    onSave({
      key: form.key,
      name: form.name ?? "",
      description: form.description ?? "",
      providerId: (form.providerId as string) || null,
      providerPlacementId: (form.providerPlacementId as string) || "",
      format: (form.format as string) || null,
      enabled: !!form.enabled,
      priority: Number(form.priority ?? 100),
    });
  };

  const knownKeys = meta?.placements ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit placement" : "Add placement"}</DialogTitle>
          <DialogDescription>Assign a provider to a placement. Different placements can use different providers.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Key">
              <Input value={(form.key as string) ?? ""} onChange={(e) => set("key", e.target.value.toUpperCase())} placeholder="e.g. WEB_CONTRIBUTION" disabled={!!editing} />
            </Field>
            <Field label="Name">
              <Input value={(form.name as string) ?? ""} onChange={(e) => set("name", e.target.value)} />
            </Field>
          </div>
          <Field label="Provider">
            <Select
              value={(form.providerId as string) || "_none"}
              onValueChange={(v) => set("providerId", v === "_none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Provider zone / placement id / link">
            <Input value={(form.providerPlacementId as string) ?? ""} onChange={(e) => set("providerPlacementId", e.target.value)} placeholder="e.g. Adsterra zone id or https://…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Format">
              <Select value={(form.format as string) || "_auto"} onValueChange={(v) => set("format", v === "_auto" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_auto">Auto (provider type)</SelectItem>
                  {(meta?.providerTypes ?? []).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Input type="number" value={(form.priority as number) ?? 100} onChange={(e) => set("priority", Number(e.target.value))} />
            </Field>
          </div>
          <Field label="Description">
            <Input value={(form.description as string) ?? ""} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={!!form.enabled} onCheckedChange={(v) => set("enabled", v)} /> Enabled
          </label>
          {knownKeys.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {knownKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("key", k)}
                  className="rounded-full border border-line px-3 py-1 text-xs text-muted-foreground hover:bg-surface"
                >
                  {k}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={saving}>
              {editing ? "Save changes" : "Create placement"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Small helpers ---------------------------------------------------

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ProvRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-10" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-10" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
