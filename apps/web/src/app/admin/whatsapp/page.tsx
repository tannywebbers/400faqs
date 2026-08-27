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
  Trash2,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  XCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
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
  usageCount: number;
  _count: { campaigns: number };
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
  totalUsage: number;
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
  const [templateForm, setTemplateForm] = useState({
    name: "",
    body: "",
    header: "",
    footer: "",
    category: "UTILITY",
    language: "en",
  });
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [msgFilter, setMsgFilter] = useState({ direction: "", phone: "", status: "" });
  const [msgPage, setMsgPage] = useState(1);
  const [sessionFilter, setSessionFilter] = useState("");
  const [sessionPage, setSessionPage] = useState(1);

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

  const createTemplateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/api/admin/whatsapp/templates", { method: "POST", body: data, token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-wa-templates"] });
      setTemplateForm({ name: "", body: "", header: "", footer: "", category: "UTILITY", language: "en" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/api/admin/whatsapp/templates/${id}`, { method: "PUT", body: data, token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-wa-templates"] });
      setEditingTemplate(null);
      setTemplateForm({ name: "", body: "", header: "", footer: "", category: "UTILITY", language: "en" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/whatsapp/templates/${id}`, { method: "DELETE", token }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-wa-templates"] }),
  });

  const submitTemplateMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/whatsapp/templates/${id}/submit`, { method: "POST", token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-wa-templates"] });
      queryClient.invalidateQueries({ queryKey: ["admin-wa-template-stats"] });
    },
  });

  const metaStatusMutation = useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      apiFetch(`/api/admin/whatsapp/templates/${id}/meta-status`, { method: "POST", body: { metaStatus: status, reason }, token }),
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
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Access Token</Label>
                  <div className="flex items-center">
                    <Input
                      type="password"
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
                    type="password"
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
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-100 text-red-600"><AlertTriangle className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm text-muted-foreground">Total Usage</p>
                  <p className="font-semibold">{templateStatsQuery.data?.totalUsage?.toLocaleString() ?? "—"}</p>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Message Templates</CardTitle>
              <CardDescription>Create and manage reusable message templates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Template Name</Label>
                  <Input placeholder="e.g. welcome_message" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <select
                    value={templateForm.category}
                    onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="UTILITY">Utility</option>
                    <option value="MARKETING">Marketing</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Header (optional, max 60 chars)</Label>
                  <Input placeholder="Optional header text" value={templateForm.header} onChange={(e) => setTemplateForm({ ...templateForm, header: e.target.value })} maxLength={60} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Body *</Label>
                  <textarea
                    placeholder="Template body text. Use {{1}}, {{2}} for variables."
                    value={templateForm.body}
                    onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                    rows={3}
                    maxLength={1024}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Footer (optional, max 60 chars)</Label>
                  <Input placeholder="Optional footer text" value={templateForm.footer} onChange={(e) => setTemplateForm({ ...templateForm, footer: e.target.value })} maxLength={60} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {editingTemplate && (
                  <Button variant="outline" onClick={() => { setEditingTemplate(null); setTemplateForm({ name: "", body: "", header: "", footer: "", category: "UTILITY", language: "en" }); }}>
                    Cancel
                  </Button>
                )}
                <Button
                  onClick={() => {
                    if (!templateForm.name || !templateForm.body) return;
                    const data = { ...templateForm, status: "ACTIVE" };
                    if (editingTemplate) {
                      updateTemplateMutation.mutate({ id: editingTemplate, data });
                    } else {
                      createTemplateMutation.mutate(data);
                    }
                  }}
                  disabled={createTemplateMutation.isPending || updateTemplateMutation.isPending || !templateForm.name || !templateForm.body}
                >
                  {editingTemplate ? "Update Template" : "Create Template"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              {templatesQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : !(templatesQuery.data?.data ?? []).length ? (
                <EmptyState title="No templates" description="Create your first message template above." className="py-12" />
              ) : (
<Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Body Preview</TableHead>
                        <TableHead>Meta Status</TableHead>
                        <TableHead>Uses</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(templatesQuery.data?.data ?? []).map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell><Badge variant="gray">{t.category}</Badge></TableCell>
                          <TableCell className="max-w-[180px] truncate text-muted-foreground text-sm">{t.body}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant={t.metaStatus === "APPROVED" ? "green" : t.metaStatus === "REJECTED" || t.status === "REJECTED" ? "red" : t.status === "SUBMITTED" || t.metaStatus === "PENDING" ? "orange" : "gray"}>
                                {t.metaStatus ?? t.status}
                              </Badge>
                              {(t.metaRejectionReason ?? (t.status === "REJECTED" ? t.metaRejectionReason : null)) && (
                                <span className="max-w-[140px] truncate text-[10px] text-red-600" title={t.metaRejectionReason ?? undefined}>
                                  {t.metaRejectionReason}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{t.usageCount ?? 0}</span>
                            {t._count?.campaigns > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({t._count.campaigns} camp)</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{timeAgo(t.createdAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {(t.status === "DRAFT" || t.status === "ACTIVE" || t.status === "SUBMITTED") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-brand"
                                  disabled={submitTemplateMutation.isPending}
                                  onClick={() => submitTemplateMutation.mutate(t.id)}
                                >
                                  {submitTemplateMutation.isPending ? "…" : "Submit to Meta"}
                                </Button>
                              )}
                              {["DRAFT", "ACTIVE", "SUBMITTED", "APPROVED", "REJECTED"].includes(t.status) && (
                                <select
                                  value={t.metaStatus ?? t.status}
                                  disabled={metaStatusMutation.isPending}
                                  onChange={(e) => {
                                    if (e.target.value === "REJECTED") {
                                      const reason = prompt("Rejection reason (optional):");
                                      metaStatusMutation.mutate({ id: t.id, status: e.target.value, reason: reason ?? undefined });
                                    } else {
                                      metaStatusMutation.mutate({ id: t.id, status: e.target.value });
                                    }
                                  }}
                                  className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
                                >
                                  <option value="PENDING">Pending</option>
                                  <option value="APPROVED">Approve</option>
                                  <option value="REJECTED">Reject</option>
                                </select>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingTemplate(t.id);
                                  setTemplateForm({
                                    name: t.name,
                                    body: t.body,
                                    header: t.header ?? "",
                                    footer: t.footer ?? "",
                                    category: t.category,
                                    language: t.language,
                                  });
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => {
                                  if (confirm(`Delete template "${t.name}"?`)) deleteTemplateMutation.mutate(t.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
