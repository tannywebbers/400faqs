"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Save, Sparkles } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type SettingRow = { key: string; value: string; type: string; group: string; description: string | null; public: boolean };

type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "textarea" | "boolean";
  public: boolean;
  hint?: string;
};

type GroupDef = {
  label: string;
  description: string;
  fields: FieldDef[];
};

const GROUPS: GroupDef[] = [
  {
    label: "General",
    description: "Site-wide branding",
    fields: [
      { key: "site.name", label: "Site Name", public: true },
      { key: "site.tagline", label: "Tagline", public: true },
      { key: "site.description", label: "Description", type: "textarea", public: true },
      { key: "site.logo", label: "Logo URL (empty = text logo)", public: true },
      { key: "site.version", label: "Version", public: true },
    ],
  },
  {
    label: "Hero",
    description: "Landing page hero section",
    fields: [
      { key: "site.landing.headline", label: "Headline", public: true },
      { key: "site.hero.badge", label: "Hero badge pill", public: true },
      { key: "site.hero.subtitle", label: "Hero subtitle", public: true },
    ],
  },
  {
    label: "Contact & Social",
    description: "Where people can reach you",
    fields: [
      { key: "whatsapp.number", label: "WhatsApp Number (E.164)", public: true },
      { key: "contact.email", label: "Support Email", public: true },
      { key: "contact.phone", label: "Support Phone", public: true },
      { key: "contact.address", label: "Business Address", public: true },
      { key: "social.twitter", label: "Twitter / X URL", public: true },
      { key: "social.instagram", label: "Instagram URL", public: true },
      { key: "social.facebook", label: "Facebook URL", public: true },
      { key: "social.youtube", label: "YouTube URL", public: true },
      { key: "social.tiktok", label: "TikTok URL", public: true },
    ],
  },
  {
    label: "WhatsApp",
    description: "Bot identity and greeting used on WhatsApp",
    fields: [
      { key: "whatsapp.displayName", label: "Bot display name", public: true },
      { key: "whatsapp.greeting", label: "Greeting message", type: "textarea", public: true, hint: "{name} is replaced with the player's name" },
    ],
  },
  {
    label: "Uploads",
    description: "Screenshot upload limits",
    fields: [
      { key: "uploads.maxSizeMB", label: "Max upload size (MB)", type: "number", public: true },
      { key: "uploads.allowedTypes", label: "Allowed MIME types (comma separated)", public: false },
    ],
  },
  {
    label: "Game",
    description: "WhatsApp game session tuning",
    fields: [
      { key: "game.turnTimeoutMinutes", label: "Turn timeout (minutes)", type: "number", public: false },
      { key: "game.inviteExpiryMinutes", label: "Invite expiry (minutes)", type: "number", public: false },
      { key: "game.roundsPerPlayer", label: "Rounds per player", type: "number", public: false },
    ],
  },
  {
    label: "Contributions",
    description: "How community questions are accepted",
    fields: [
      { key: "contribution.enabled", label: "Enable contributions", type: "boolean", public: true },
      { key: "contribution.autoApprove", label: "Auto approve new questions when they pass all checks", type: "boolean", public: false },
      { key: "contribution.perDayLimit", label: "Daily contribution limit per phone", type: "number", public: false },
    ],
  },
  {
    label: "AI & Moderation",
    description: "Google AI duplicate detection + similarity thresholds",
    fields: [
      { key: "ai.duplicateDetectionEnabled", label: "Enable Google AI duplicate detection", type: "boolean", public: false },
      { key: "ai.model", label: "Google AI model", public: false, hint: "e.g. gemini-2.0-flash" },
      { key: "ai.maxCandidates", label: "Max candidate questions sent to AI", type: "number", public: false },
      { key: "contribution.aiThreshold", label: "Exact-duplicate threshold (0–1)", type: "number", public: false, hint: "Score above this is rejected as an exact duplicate" },
      { key: "contribution.similarThreshold", label: "Similarity threshold (0–1)", type: "number", public: false, hint: "Score above this is routed to manual review" },
    ],
  },
  {
    label: "Privacy & Terms",
    description: "Legal page content",
    fields: [
      { key: "privacy.content", label: "Privacy Policy", type: "textarea", public: true },
      { key: "privacy.lastUpdated", label: "Privacy Last Updated", public: true },
      { key: "terms.content", label: "Terms of Service", type: "textarea", public: true },
      { key: "terms.lastUpdated", label: "Terms Last Updated", public: true },
    ],
  },
  {
    label: "About",
    description: "Mission and vision statements",
    fields: [
      { key: "about.mission", label: "Mission", type: "textarea", public: true },
      { key: "about.vision", label: "Vision", type: "textarea", public: true },
    ],
  },
  {
    label: "SEO",
    description: "Default meta tags",
    fields: [
      { key: "seo.defaultTitle", label: "Default Title", public: true },
      { key: "seo.defaultDescription", label: "Default Description", type: "textarea", public: true },
      { key: "seo.defaultOgImage", label: "Default OG Image URL", public: true },
    ],
  },
  {
    label: "Appearance",
    description: "Brand colors (green / blue / orange)",
    fields: [
      { key: "appearance.primary", label: "Primary green", public: true, hint: "e.g. #2ECC71" },
      { key: "appearance.blue", label: "Primary blue", public: true, hint: "e.g. #2F80ED" },
      { key: "appearance.orange", label: "Accent orange", public: true, hint: "e.g. #F2994A" },
    ],
  },
];

function isBooleanString(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export default function AdminSettingsPage() {
  const token = getToken();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const hydrated = useRef(false);

  const query = useQuery<SettingRow[]>({
    queryKey: ["admin-settings"],
    queryFn: () => apiFetch("/api/admin/settings", { token }),
  });

  useEffect(() => {
    if (query.data && !hydrated.current) {
      const record: Record<string, string> = {};
      for (const row of query.data) record[row.key] = row.value;
      setDraft(record);
      hydrated.current = true;
    }
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => {
      const entries = GROUPS.flatMap((g) =>
        g.fields.map((f) => ({
          key: f.key,
          value: draft[f.key] ?? "",
          public: f.public,
          group: g.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        }))
      );
      return apiFetch("/api/admin/settings", { method: "PUT", token, body: { entries } });
    },
    onSuccess: () => {
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const set = (key: string, value: string) => setDraft((prev) => ({ ...prev, [key]: value }));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Global configuration and content</p>
        </div>
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          <Save className="h-4 w-4" /> Save All
        </Button>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      ) : (
        <div className="space-y-6">
          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertTitle>Google AI duplicate detection</AlertTitle>
            <AlertDescription>
              The Google AI API key is configured server-side via the <code className="font-mono text-xs">GOOGLE_AI_API_KEY</code> environment variable and is never stored, shown or exposed to the browser. Use the AI &amp;
              Moderation group below to toggle detection, pick a model, set candidate limits and similarity thresholds.
            </AlertDescription>
          </Alert>

          <div className="grid gap-6 lg:grid-cols-2">
            {GROUPS.map((group) => (
              <Card key={group.label}>
                <CardHeader>
                  <CardTitle>{group.label}</CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {group.fields.map((field) => {
                    const value = draft[field.key] ?? "";
                    if (field.type === "boolean") {
                      return (
                        <div key={field.key} className="flex items-center justify-between gap-4">
                          <div>
                            <Label>{field.label}</Label>
                            {field.hint && <p className="mt-0.5 text-xs text-muted-foreground">{field.hint}</p>}
                          </div>
                          <Switch
                            checked={isBooleanString(value)}
                            onCheckedChange={(checked) => set(field.key, checked ? "1" : "0")}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={field.key} className="space-y-1.5">
                        <Label>{field.label}</Label>
                        {field.type === "textarea" ? (
                          <Textarea value={value} onChange={(e) => set(field.key, e.target.value)} rows={6} />
                        ) : (
                          <Input
                            type={field.type === "number" ? "number" : "text"}
                            step={field.type === "number" ? "any" : undefined}
                            value={value}
                            onChange={(e) => set(field.key, e.target.value)}
                          />
                        )}
                        {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}