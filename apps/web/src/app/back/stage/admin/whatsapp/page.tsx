"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  MessageCircle,
  Webhook,
  Phone,
  Activity,
  Settings,
  Send,
  FileText,
  RefreshCw,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
  XCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { maskPhone, formatDateTime, timeAgo } from "@/lib/utils";

type WhatsAppStatus = {
  configured: boolean;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  graphVersion: string;
  apiBase: string;
  appId: string;
  maskedToken: string;
  maskedSecret: string;
  source: "env" | "database";
  connection: { connected: boolean; phoneInfo?: { verifiedName?: string; displayPhoneNumber?: string }; error?: string };
  stats: { activeSessions: number; messagesInbound: number; messagesOutbound: number; totalMessages: number };
  botNumber?: string;
  publicStartLink?: string | null;
  monetizationEnabled?: boolean;
  webhookUrl: string;
};

type MessageTemplate = {
  id: string;
  name: string;
  category: string;
  language: string;
  header: string | null;
  body: string;
  footer: string | null;
  buttons: unknown;
  status: string;
  metaStatus: string | null;
  metaRejectionReason: string | null;
  waTemplateId: string | null;
  metaUpdatedAt: string | null;
  usageCount: number;
  createdAt: string;
};

type TemplateStats = {
  total: number;
  draft: number;
  active: number;
  submitted: number;
  approved: number;
  rejected: number;
  archived: number;
  synced: number;
};

type TemplateSyncResult = {
  synced: boolean;
  remote: boolean;
  count: number;
  created: number;
  updated: number;
  warning: string | null;
};

type MessageLogEntry = {
  id: string;
  direction: string;
  phone: string;
  type: string;
  status: string;
  content: Record<string, unknown>;
  error: string | null;
  createdAt: string;
};

type Session = {
  id: string;
  inviteCode: string;
  status: string;
  creator: { phone: string; name: string | null };
  joiner: { phone: string; name: string | null } | null;
  category: { name: string } | null;
  _count: { moves: number };
  createdAt: string;
};

const STATUS_COLOR: Record<string, "green" | "orange" | "gray" | "blue" | "red"> = {
  operational: "green",
  connected: "green",
  sent: "green",
  received: "blue",
  failed: "red",
  delivered: "green",
  read: "green",
  pending: "orange",
  WAITING: "orange",
  ACTIVE: "green",
  COMPLETED: "blue",
  ABANDONED: "red",
};

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />;
}

export default function AdminWhatsAppPage() {
  const token = getToken();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [configForm, setConfigForm] = useState({
    accessToken: "",
    phoneNumberId: "",
    businessAccountId: "",
    appId: "",
    appSecret: "",
    graphVersion: "",
    apiBase: "",
    webhookVerifyToken: "",
  });
  const [msgFilter, setMsgFilter] = useState({ direction: "", phone: "", status: "" });
  const [msgPage, setMsgPage] = useState(1);
  const [sessionFilter, setSessionFilter] = useState("");
  const [sessionPage, setSessionPage] = useState(1);
  const [showSecrets, setShowSecrets] = useState(false);

  // ── Queries ──────────────────────────────────────────────

  const statusQuery = useQuery<WhatsAppStatus>({
    queryKey: ["admin-whatsapp-status"],
    queryFn: () => apiFetch("/api/admin/whatsapp/status", { token }),
    refetchInterval: 30_000,
  });

  const templatesQuery = useQuery<{ data: MessageTemplate[]; total: number; totalPages: number }>({
    queryKey: ["admin-wa-templates"],
    queryFn: () => apiFetch("/api/admin/whatsapp/templates", { token }),
  });

  const templateStatsQuery = useQuery<TemplateStats>({
    queryKey: ["admin-wa-template-stats"],
    queryFn: () => apiFetch("/api/admin/whatsapp/templates/stats", { token }),
  });

  const messagesQuery = useQuery<{ data: MessageLogEntry[]; total: number; totalPages: number }>({
    queryKey: ["admin-wa-messages", msgFilter, msgPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(msgPage), limit: "30" });
      if (msgFilter.direction) params.set("direction", msgFilter.direction);
      if (msgFilter.phone) params.set("phone", msgFilter.phone);
      if (msgFilter.status) params.set("status", msgFilter.status);
      return apiFetch(`/api/admin/whatsapp/messages?${params}`, { token });
    },
  });

  const sessionsQuery = useQuery<{ data: Session[]; total: number; totalPages: number }>({
    queryKey: ["admin-wa-sessions", sessionFilter, sessionPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(sessionPage), limit: "20" });
      if (sessionFilter) params.set("status", sessionFilter);
      return apiFetch(`/api/admin/whatsapp/sessions?${params}`, { token });
    },
  });

  // ── Mutations ────────────────────────────────────────────

  const updateConfigMutation = useMutation({
    mutationFn: (data: Record<string, string>) =>
      apiFetch("/api/admin/whatsapp/config", { method: "PUT", body: data, token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-whatsapp-status"] });
    },
  });

  const regenerateWebhookMutation = useMutation({
    mutationFn: () => apiFetch("/api/admin/whatsapp/webhook/regenerate", { method: "POST", token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-whatsapp-status"] });
    },
  });

  const testSendMutation = useMutation({
    mutationFn: (data: { phone: string; message: string }) =>
      apiFetch("/api/admin/whatsapp/test-send", { method: "POST", body: data, token }),
    onSuccess: () => {
      setTestPhone("");
      setTestMessage("");
      queryClient.invalidateQueries({ queryKey: ["admin-wa-messages"] });
    },
  });

  const syncTemplatesMutation = useMutation<TemplateSyncResult>({
    mutationFn: () => apiFetch("/api/admin/whatsapp/templates/sync", { method: "POST", token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-wa-templates"] });
      queryClient.invalidateQueries({ queryKey: ["admin-wa-template-stats"] });
    },
  });

  // ── Helpers ──────────────────────────────────────────────

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function CopyButton({ text, id }: { text: string; id: string }) {
    return (
      <button onClick={() => copyToClipboard(text, id)} className="ml-2 text-muted-foreground hover:text-foreground transition-colors">
        {copied === id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    );
  }

  const s = statusQuery.data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Manage WhatsApp Business API connection, templates, and messages</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="credentials">Credentials</TabsTrigger>
          <TabsTrigger value="webhook">Webhook</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        {/* ── Overview ──────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${s?.connection?.connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">Connection</p>
                  <p className="font-semibold">{s ? (s.connection.connected ? "Connected" : "Disconnected") : "Checking..."}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Phone className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">Phone Number</p>
                  <p className="font-semibold">{s?.connection?.phoneInfo?.displayPhoneNumber ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ArrowDownLeft className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">Inbound Messages</p>
                  <p className="font-semibold">{s?.stats?.messagesInbound?.toLocaleString() ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <ArrowUpRight className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm text-muted-foreground">Outbound Messages</p>
                  <p className="font-semibold">{s?.stats?.messagesOutbound?.toLocaleString() ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Active Sessions</p>
                    <p className="text-2xl font-bold">{s?.stats?.activeSessions ?? "—"}</p>
                  </div>
                  <Activity className="h-8 w-8 text-muted-foreground/40" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Config Source</p>
                    <p className="text-2xl font-bold capitalize">{s?.source ?? "—"}</p>
                  </div>
                  <Settings className="h-8 w-8 text-muted-foreground/40" />
                </div>
              </CardContent>
            </Card>
          </div>

          {s?.connection?.error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="flex items-center gap-3 p-4">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <p className="text-sm text-red-700">{s.connection.error}</p>
              </CardContent>
            </Card>
          )}

          {/* Player entry point — the whatsapp.number public setting drives the
              floating START button and the wa.me invites users actually see. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Phone className="h-4 w-4" /> Player Entry Point</CardTitle>
              <CardDescription>
                The <span className="font-mono">whatsapp.number</span> public setting users message with START (or /start /new play /create). Set it under Settings if the floating button or invites show nothing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Bot Number</p>
                  <p className={s?.botNumber ? "font-mono font-semibold" : "text-sm text-muted-foreground"}>{s?.botNumber || "— not set —"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monetization</p>
                  <span className={`inline-flex items-center gap-1 text-sm font-medium ${s?.monetizationEnabled ? "text-green-600" : "text-muted-foreground"}`}>
                    {s?.monetizationEnabled ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {s?.monetizationEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {s?.publicStartLink && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">Prefilled START link</p>
                    <div className="flex items-center gap-2 truncate rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs">
                      <span className="flex-1 truncate">{s.publicStartLink}</span>
                      <CopyButton text={s.publicStartLink} id="start-link" />
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Test Send */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Test Send</CardTitle>
              <CardDescription>Send a test message to verify your WhatsApp connection</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input placeholder="Phone number (e.g. 1234567890)" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} className="sm:w-56" />
                <Input placeholder="Test message" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} className="flex-1" />
                <Button
                  onClick={() => testSendMutation.mutate({ phone: testPhone, message: testMessage })}
                  disabled={!testPhone || !testMessage || testSendMutation.isPending}
                >
                  {testSendMutation.isPending ? "Sending..." : "Send"}
                </Button>
              </div>
              {testSendMutation.isError && <p className="mt-2 text-sm text-red-600">{(testSendMutation.error as Error).message}</p>}
              {testSendMutation.isSuccess && <p className="mt-2 text-sm text-green-600">Message sent successfully</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Credentials ───────────────────────────────── */}
        <TabsContent value="credentials" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>API Credentials</CardTitle>
              <CardDescription>
                Configure your WhatsApp Business API credentials.{" "}
                {s?.source === "env" && <span className="text-amber-600">Currently using environment variables.</span>}
                {s?.source === "database" && <span className="text-green-600">Using database-stored credentials.</span>}
              </CardDescription>
              <Button type="button" variant="outline" size="sm" className="mt-2 w-fit" onClick={() => setShowSecrets((v) => !v)}>
                {showSecrets ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {showSecrets ? "Hide secrets" : "Reveal secrets"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                  <Label>Access Token</Label>
                  <div className="flex items-center">
                    <Input
                      type={showSecrets ? "text" : "password"}
                      placeholder={s?.maskedToken || "Enter access token"}
                      value={configForm.accessToken}
                      onChange={(e) => setConfigForm({ ...configForm, accessToken: e.target.value })}
                    />
                  </div>
                  {s?.maskedToken && <p className="text-xs text-muted-foreground">Current: {s.maskedToken}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Phone Number ID</Label>
                  <Input
                    placeholder={s?.phoneNumberId || "Enter phone number ID"}
                    value={configForm.phoneNumberId}
                    onChange={(e) => setConfigForm({ ...configForm, phoneNumberId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Business Account ID</Label>
                  <Input
                    placeholder={s?.businessAccountId || "Enter business account ID"}
                    value={configForm.businessAccountId}
                    onChange={(e) => setConfigForm({ ...configForm, businessAccountId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>App ID</Label>
                  <Input
                    placeholder={s?.appId || "Enter Meta App ID"}
                    value={configForm.appId}
                    onChange={(e) => setConfigForm({ ...configForm, appId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>App Secret</Label>
                  <Input
                    type={showSecrets ? "text" : "password"}
                    placeholder={s?.maskedSecret || "Enter Meta App Secret"}
                    value={configForm.appSecret}
                    onChange={(e) => setConfigForm({ ...configForm, appSecret: e.target.value })}
                  />
                  {s?.maskedSecret && <p className="text-xs text-muted-foreground">Current: {s.maskedSecret}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Graph API Version</Label>
                  <Input
                    placeholder={s?.graphVersion || "v19.0"}
                    value={configForm.graphVersion}
                    onChange={(e) => setConfigForm({ ...configForm, graphVersion: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Base URL</Label>
                  <Input
                    placeholder={s?.apiBase || "https://graph.facebook.com"}
                    value={configForm.apiBase}
                    onChange={(e) => setConfigForm({ ...configForm, apiBase: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Webhook Verify Token</Label>
                  <div className="flex items-center">
                    <Input
                      type={showSecrets ? "text" : "password"}
                      placeholder={s?.webhookVerifyToken || "Enter verify token"}
                      value={configForm.webhookVerifyToken}
                      onChange={(e) => setConfigForm({ ...configForm, webhookVerifyToken: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    const data: Record<string, string> = {};
                    for (const [k, v] of Object.entries(configForm)) {
                      if (v) data[k] = v;
                    }
                    if (Object.keys(data).length) updateConfigMutation.mutate(data);
                  }}
                  disabled={updateConfigMutation.isPending}
                >
                  {updateConfigMutation.isPending ? "Saving..." : "Save Credentials"}
                </Button>
              </div>
              {updateConfigMutation.isSuccess && <p className="text-sm text-green-600 text-right">Credentials updated</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Webhook ───────────────────────────────────── */}
        <TabsContent value="webhook" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhook Configuration</CardTitle>
              <CardDescription>Configure the webhook URL in your Meta Developer Dashboard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 font-mono text-sm">
                  <span className="flex-1 truncate">{s?.webhookUrl || "—"}</span>
                  <CopyButton text={s?.webhookUrl || ""} id="webhook-url" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Verify Token</Label>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 font-mono text-sm">
                  <span className="flex-1 truncate">{s?.webhookVerifyToken || "—"}</span>
                  <CopyButton text={s?.webhookVerifyToken || ""} id="verify-token" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Graph Version</Label>
                <div className="rounded-lg border bg-muted/50 px-3 py-2 font-mono text-sm">{s?.graphVersion || "—"}</div>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => regenerateWebhookMutation.mutate()}
                  disabled={regenerateWebhookMutation.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {regenerateWebhookMutation.isPending ? "Regenerating..." : "Regenerate Verify Token"}
                </Button>
              </div>
              {regenerateWebhookMutation.isSuccess && (
                <p className="text-sm text-green-600 text-right">Token regenerated. Update your Meta Dashboard with the new token.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Setup Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <ol className="list-decimal list-inside space-y-2">
                <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener" className="text-brand underline">Meta Developer Dashboard</a></li>
                <li>Navigate to your App &gt; WhatsApp &gt; Configuration</li>
                <li>Under Webhook, click <strong>Configure Webhook</strong></li>
                <li>Paste the <strong>Webhook URL</strong> above</li>
                <li>Paste the <strong>Verify Token</strong> above and click <strong>Verify and Save</strong></li>
                <li>Subscribe to <strong>messages</strong> and <strong>message_deliveries</strong> fields</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Templates ─────────────────────────────────── */}
        <TabsContent value="templates" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand"><FileText className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm text-muted-foreground">Total Templates</p>
                  <p className="font-semibold">{templateStatsQuery.data?.total ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 text-green-700"><CheckCircle2 className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm text-muted-foreground">Approved (Meta)</p>
                  <p className="font-semibold">{templateStatsQuery.data?.approved ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-600"><Clock className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm text-muted-foreground">Pending / Submitted</p>
                  <p className="font-semibold">{templateStatsQuery.data?.submitted ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><RefreshCw className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm text-muted-foreground">Synced from Meta</p>
                  <p className="font-semibold">{templateStatsQuery.data?.synced ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Message Templates</CardTitle>
              <CardDescription>
                Meta is the source of truth for WhatsApp templates. Sync pulls the current template library from{" "}
                <span className="font-mono">{s?.businessAccountId ? "your" : "—"}</span> Meta Business Platform; templates cannot be created or edited here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
                <div className="max-w-xl text-sm text-muted-foreground">
                  {syncTemplatesMutation.data?.warning ? (
                    <span className="text-amber-600">{syncTemplatesMutation.data.warning}</span>
                  ) : syncTemplatesMutation.data ? (
                    <span className="text-green-600">
                      Synced {syncTemplatesMutation.data.count} template{syncTemplatesMutation.data.count === 1 ? "" : "s"} — {syncTemplatesMutation.data.created} created,{" "}
                      {syncTemplatesMutation.data.updated} updated.
                    </span>
                  ) : (
                    "Templates are downloaded from Meta and cached locally. Ready for the approval workflow on the Meta dashboard."
                  )}
                </div>
                <Button onClick={() => syncTemplatesMutation.mutate()} disabled={syncTemplatesMutation.isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncTemplatesMutation.isPending ? "animate-spin" : ""}`} />
                  {syncTemplatesMutation.isPending ? "Syncing…" : "Sync from Meta"}
                </Button>
              </div>
              {syncTemplatesMutation.isError && (
                <p className="text-sm text-red-600">{(syncTemplatesMutation.error as Error).message}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {templatesQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : !(templatesQuery.data?.data ?? []).length ? (
                <EmptyState title="No templates" description="Sync from Meta to load your template library." className="py-12" />
              ) : (
<Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Body Preview</TableHead>
                        <TableHead>Meta Status</TableHead>
                        <TableHead>Uses</TableHead>
                        <TableHead>Synced</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(templatesQuery.data?.data ?? []).map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell><Badge variant="gray">{t.category}</Badge></TableCell>
                          <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">{t.body}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant={t.metaStatus === "APPROVED" ? "green" : t.metaStatus === "REJECTED" || t.status === "REJECTED" ? "red" : t.status === "SUBMITTED" || t.metaStatus === "PENDING" ? "orange" : "gray"}>
                                {t.metaStatus ?? t.status}
                              </Badge>
                              {t.metaRejectionReason && (
                                <span className="max-w-[140px] truncate text-[10px] text-red-600" title={t.metaRejectionReason}>
                                  {t.metaRejectionReason}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{t.usageCount ?? 0}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.metaUpdatedAt ? timeAgo(t.metaUpdatedAt) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Messages ──────────────────────────────────── */}
        <TabsContent value="messages" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Message Log</CardTitle>
              <CardDescription>Recent inbound and outbound WhatsApp messages</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <select
                  value={msgFilter.direction}
                  onChange={(e) => { setMsgFilter({ ...msgFilter, direction: e.target.value }); setMsgPage(1); }}
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All Directions</option>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                </select>
                <select
                  value={msgFilter.status}
                  onChange={(e) => { setMsgFilter({ ...msgFilter, status: e.target.value }); setMsgPage(1); }}
                  className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">All Statuses</option>
                  <option value="received">Received</option>
                  <option value="sent">Sent</option>
                  <option value="delivered">Delivered</option>
                  <option value="read">Read</option>
                  <option value="failed">Failed</option>
                </select>
                <Input
                  placeholder="Filter by phone..."
                  value={msgFilter.phone}
                  onChange={(e) => { setMsgFilter({ ...msgFilter, phone: e.target.value }); setMsgPage(1); }}
                  className="sm:w-48"
                />
              </div>

              {messagesQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                </div>
              ) : !(messagesQuery.data?.data ?? []).length ? (
                <EmptyState title="No messages" description="Messages will appear here as they are sent and received." className="py-12" />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Direction</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Content</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(messagesQuery.data?.data ?? []).map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            {m.direction === "inbound" ? (
                              <span className="inline-flex items-center gap-1 text-blue-600"><ArrowDownLeft className="h-3 w-3" /> In</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-purple-600"><ArrowUpRight className="h-3 w-3" /> Out</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{maskPhone(m.phone)}</TableCell>
                          <TableCell className="text-xs">{m.type}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                            {typeof m.content === "object" && m.content !== null
                              ? (m.content as Record<string, unknown>).text as string ?? (m.content as Record<string, unknown>).body as string ?? m.type
                              : m.type}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_COLOR[m.status] ?? "gray"}>{m.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{timeAgo(m.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {(messagesQuery.data?.totalPages ?? 0) > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Page {msgPage} of {messagesQuery.data?.totalPages} ({messagesQuery.data?.total} total)
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={msgPage <= 1} onClick={() => setMsgPage(msgPage - 1)}>Previous</Button>
                        <Button variant="outline" size="sm" disabled={msgPage >= (messagesQuery.data?.totalPages ?? 1)} onClick={() => setMsgPage(msgPage + 1)}>Next</Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sessions ──────────────────────────────────── */}
        <TabsContent value="sessions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Game Sessions</CardTitle>
              <CardDescription>Active and recent WhatsApp game sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-2">
                {["", "WAITING", "ACTIVE", "COMPLETED", "ABANDONED"].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSessionFilter(s); setSessionPage(1); }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      sessionFilter === s ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
                    }`}
                  >
                    {s || "All"}
                  </button>
                ))}
              </div>

              {sessionsQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                </div>
              ) : !(sessionsQuery.data?.data ?? []).length ? (
                <EmptyState title="No sessions" description="Game sessions will appear here." className="py-12" />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Host</TableHead>
                        <TableHead>Joiner</TableHead>
                        <TableHead>Moves</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(sessionsQuery.data?.data ?? []).map((s) => (
                        <TableRow key={s.id}>
                          <TableCell><span className="font-mono text-xs font-semibold">{s.inviteCode}</span></TableCell>
                          <TableCell>{s.category?.name ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{maskPhone(s.creator.phone)}</TableCell>
                          <TableCell className="font-mono text-xs">{s.joiner ? maskPhone(s.joiner.phone) : "—"}</TableCell>
                          <TableCell>{s._count.moves}</TableCell>
                          <TableCell><Badge variant={STATUS_COLOR[s.status] ?? "gray"}>{s.status}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground">{timeAgo(s.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {(sessionsQuery.data?.totalPages ?? 0) > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Page {sessionPage} of {sessionsQuery.data?.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled={sessionPage <= 1} onClick={() => setSessionPage(sessionPage - 1)}>Previous</Button>
                        <Button variant="outline" size="sm" disabled={sessionPage >= (sessionsQuery.data?.totalPages ?? 1)} onClick={() => setSessionPage(sessionPage + 1)}>Next</Button>
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
