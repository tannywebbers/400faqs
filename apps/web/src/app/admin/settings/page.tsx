"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Settings = Record<string, string>;

const GROUPS: { label: string; description: string; keys: { key: string; label: string; multiline?: boolean }[] }[] = [
  {
    label: "General",
    description: "Site-wide branding and SEO",
    keys: [
      { key: "site.name", label: "Site Name" },
      { key: "site.tagline", label: "Tagline" },
      { key: "site.description", label: "Description", multiline: true },
      { key: "site.baseUrl", label: "Base URL" },
    ],
  },
  {
    label: "Contact & Social",
    description: "Where people can reach you",
    keys: [
      { key: "whatsapp.number", label: "WhatsApp Number" },
      { key: "contact.email", label: "Support Email" },
    ],
  },
  {
    label: "Legal Pages",
    description: "Privacy policy and terms content",
    keys: [
      { key: "privacy.content", label: "Privacy Policy", multiline: true },
      { key: "privacy.lastUpdated", label: "Privacy Last Updated" },
      { key: "terms.content", label: "Terms of Service", multiline: true },
      { key: "terms.lastUpdated", label: "Terms Last Updated" },
    ],
  },
  {
    label: "About",
    description: "Mission and vision statements",
    keys: [
      { key: "about.mission", label: "Mission", multiline: true },
      { key: "about.vision", label: "Vision", multiline: true },
    ],
  },
  {
    label: "Content",
    description: "Category and contribution settings",
    keys: [
      { key: "content.minContributionLength", label: "Min Contribution Length" },
      { key: "content.maxContributionLength", label: "Max Contribution Length" },
    ],
  },
];

export default function AdminSettingsPage() {
  const token = getToken();
  const [draft, setDraft] = useState<Settings>({});

  const query = useQuery<Settings>({
    queryKey: ["admin-settings"],
    queryFn: () => apiFetch("/api/admin/settings", { token }),
  });

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => apiFetch("/api/admin/settings", { method: "PUT", token, body: draft }),
    onSuccess: () => {
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

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
        <div className="grid gap-6 lg:grid-cols-2">
          {GROUPS.map((group) => (
            <Card key={group.label}>
              <CardHeader>
                <CardTitle>{group.label}</CardTitle>
                <CardDescription>{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.keys.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label>{field.label}</Label>
                    {field.multiline ? (
                      <Textarea
                        value={draft[field.key] ?? ""}
                        onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                        rows={field.key.includes("content") ? 8 : 3}
                      />
                    ) : (
                      <Input value={draft[field.key] ?? ""} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })} />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
