"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import {
  LayoutGrid,
  Eye,
  EyeOff,
  Edit3,
  Save,
  Loader2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Type,
  Link2,
  Settings2,
  Code,
  RefreshCw,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Users,
  Gift,
} from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type LandingSection = {
  id: string;
  sectionKey: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  imageUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
  metadata: unknown;
};

type StepItem = { title: string; description: string };
type StatItem = { value: string; label: string };
type FeatureItem = { icon: string; title: string; description: string };
type LegalSectionItem = { heading: string; body: string };

const ICON_OPTIONS = ["♾️", "🗂️", "🤝", "💭", "🔥", "🎲", "📜", "✨", "🚀", "💬", "👑", "🎯", "🎁", "🎮"];

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero Banner",
  stats: "Statistics",
  how_it_works: "How It Works",
  features: "Features",
  categories: "Trending Categories",
  faqs: "FAQs",
  cta: "Call to Action",
  privacy_policy: "Privacy Policy",
  terms_of_service: "Terms of Service",
  cookies_policy: "Cookies Policy",
};

function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? key.replace(/_/g, " ");
}

function sectionIcon(key: string) {
  switch (key) {
    case "hero":
      return <Sparkles className="h-4 w-4" />;
    case "features":
      return <TrendingUp className="h-4 w-4" />;
    case "how_it_works":
      return <Users className="h-4 w-4" />;
    case "cta":
      return <Gift className="h-4 w-4" />;
    default:
      return <LayoutGrid className="h-4 w-4" />;
  }
}

function parseJson<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function IconBtn({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "rounded-md border border-line bg-white p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-40",
        props.className
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, children, help }: { label: string; children?: ReactNode; help?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

export default function LandingEditorPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LandingSection | null>(null);
  const [editMode, setEditMode] = useState<"visual" | "html">("visual");
  const [htmlContent, setHtmlContent] = useState("");
  const [previewKey, setPreviewKey] = useState(0);

  const [steps, setSteps] = useState<StepItem[]>([]);
  const [stats, setStats] = useState<StatItem[]>([]);
  const [features, setFeatures] = useState<FeatureItem[]>([]);
  const [legalSections, setLegalSections] = useState<LegalSectionItem[]>([]);

  const { data: sections = [], isLoading, refetch } = useQuery<LandingSection[]>({
    queryKey: ["admin-landing"],
    queryFn: () => apiFetch("/api/admin/landing", { token }),
  });

  const bumpPreview = () => setPreviewKey((k) => k + 1);

  const openEditor = (section: LandingSection) => {
    setEditing(section);
    setEditMode("visual");
    setHtmlContent(section.content ?? "");
    if (section.sectionKey === "how_it_works") setSteps(parseJson<StepItem>(section.content));
    else if (section.sectionKey === "stats") setStats(parseJson<StatItem>(section.content));
    else if (section.sectionKey === "features") setFeatures(parseJson<FeatureItem>(section.content));
    else if (["privacy_policy", "terms_of_service", "cookies_policy"].includes(section.sectionKey)) {
      setLegalSections(parseJson<LegalSectionItem>(section.content));
    } else {
      setSteps([]);
      setStats([]);
      setFeatures([]);
      setLegalSections([]);
    }
  };

  const patch = (field: keyof LandingSection, value: unknown) => {
    if (editing) setEditing({ ...editing, [field]: value });
  };

  // ---------- array editors ----------

  const renderStepsEditor = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Steps</Label>
        <Button size="sm" variant="outline" onClick={() => setSteps([...steps, { title: "New Step", description: "Describe this step..." }])}>
          <Plus className="h-4 w-4" /> Add Step
        </Button>
      </div>
      {steps.map((step, i) => (
        <Card key={i} className="p-3">
          <div className="flex items-start gap-2">
            <div className="mt-1 flex flex-col gap-1">
              <IconBtn onClick={() => i > 0 && swap(steps, i, i - 1, setSteps)} disabled={i === 0} aria-label="Move step up">
                <ArrowUp className="h-3 w-3" />
              </IconBtn>
              <IconBtn onClick={() => i < steps.length - 1 && swap(steps, i, i + 1, setSteps)} disabled={i === steps.length - 1} aria-label="Move step down">
                <ArrowDown className="h-3 w-3" />
              </IconBtn>
            </div>
            <div className="flex-1 space-y-2">
              <Badge variant="outline">Step {i + 1}</Badge>
              <Input value={step.title} placeholder="Step title" onChange={(e) => updateAt(steps, i, { title: e.target.value }, setSteps)} />
              <Textarea value={step.description} placeholder="Step description" rows={2} onChange={(e) => updateAt(steps, i, { description: e.target.value }, setSteps)} />
            </div>
            <IconBtn onClick={() => setSteps(steps.filter((_, idx) => idx !== i))} className="text-red-500" aria-label="Remove step">
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        </Card>
      ))}
    </div>
  );

  const renderStatsEditor = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Statistics (live values, editable labels)</Label>
        <Button size="sm" variant="outline" onClick={() => setStats([...stats, { value: "questions", label: "New Stat" }])}>
          <Plus className="h-4 w-4" /> Add Stat
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {stats.map((stat, i) => (
          <Card key={i} className="p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline">Stat {i + 1}</Badge>
                <IconBtn onClick={() => setStats(stats.filter((_, idx) => idx !== i))} className="text-red-500" aria-label="Remove stat">
                  <Trash2 className="h-3 w-3" />
                </IconBtn>
              </div>
              <Input value={stat.value} placeholder='Value key: questions, categories, games, players' onChange={(e) => updateAt(stats, i, { value: e.target.value }, setStats)} />
              <Input value={stat.label} placeholder="Label (e.g. Games Played)" onChange={(e) => updateAt(stats, i, { label: e.target.value }, setStats)} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderFeaturesEditor = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Features</Label>
        <Button size="sm" variant="outline" onClick={() => setFeatures([...features, { icon: "✨", title: "New Feature", description: "Describe this feature..." }])}>
          <Plus className="h-4 w-4" /> Add Feature
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {features.map((feat, i) => (
          <Card key={i} className="p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Select value={feat.icon || "✨"} onValueChange={(v) => updateAt(features, i, { icon: v }, setFeatures)}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map((icon) => (
                      <SelectItem key={icon} value={icon}>
                        {icon}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <IconBtn onClick={() => setFeatures(features.filter((_, idx) => idx !== i))} className="text-red-500" aria-label="Remove feature">
                  <Trash2 className="h-3 w-3" />
                </IconBtn>
              </div>
              <Input value={feat.title} placeholder="Feature title" onChange={(e) => updateAt(features, i, { title: e.target.value }, setFeatures)} />
              <Textarea value={feat.description} placeholder="Feature description" rows={2} onChange={(e) => updateAt(features, i, { description: e.target.value }, setFeatures)} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const renderLegalEditor = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Content Sections</Label>
        <Button size="sm" variant="outline" onClick={() => setLegalSections([...legalSections, { heading: "New Section", body: "Write content here..." }])}>
          <Plus className="h-4 w-4" /> Add Section
        </Button>
      </div>
      {legalSections.map((item, i) => (
        <Card key={i} className="p-3">
          <div className="flex items-start gap-2">
            <div className="mt-1 flex flex-col gap-1">
              <IconBtn onClick={() => i > 0 && swap(legalSections, i, i - 1, setLegalSections)} disabled={i === 0} aria-label="Move section up">
                <ArrowUp className="h-3 w-3" />
              </IconBtn>
              <IconBtn onClick={() => i < legalSections.length - 1 && swap(legalSections, i, i + 1, setLegalSections)} disabled={i === legalSections.length - 1} aria-label="Move section down">
                <ArrowDown className="h-3 w-3" />
              </IconBtn>
            </div>
            <div className="flex-1 space-y-2">
              <Badge variant="outline">Section {i + 1}</Badge>
              <Input value={item.heading} placeholder="Heading" onChange={(e) => updateAt(legalSections, i, { heading: e.target.value }, setLegalSections)} />
              <Textarea value={item.body} placeholder="Body..." rows={4} onChange={(e) => updateAt(legalSections, i, { body: e.target.value }, setLegalSections)} />
            </div>
            <IconBtn onClick={() => setLegalSections(legalSections.filter((_, idx) => idx !== i))} className="text-red-500" aria-label="Remove section">
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        </Card>
      ))}
    </div>
  );

  // ---------- mutations ----------

  const save = async () => {
    if (!editing) return;
    let content = editing.content;
    if (editMode === "html") content = htmlContent;
    else if (editing.sectionKey === "how_it_works") content = JSON.stringify(steps);
    else if (editing.sectionKey === "stats") content = JSON.stringify(stats);
    else if (editing.sectionKey === "features") content = JSON.stringify(features);
    else if (["privacy_policy", "terms_of_service", "cookies_policy"].includes(editing.sectionKey)) content = JSON.stringify(legalSections);

    try {
      const updated = await apiFetch<LandingSection>(`/api/admin/landing/${editing.id}`, {
        method: "PUT",
        token,
        body: {
          title: editing.title,
          subtitle: editing.subtitle,
          content,
          imageUrl: editing.imageUrl,
          buttonText: editing.buttonText,
          buttonUrl: editing.buttonUrl,
          isVisible: editing.isVisible,
        },
      });
      qc.setQueryData<LandingSection[]>(["admin-landing"], (prev) => (prev ?? []).map((s) => (s.id === updated.id ? updated : s)));
      toast.success(`${sectionLabel(editing.sectionKey)} saved`);
      setEditing(null);
      bumpPreview();
    } catch {
      toast.error("Failed to save changes");
    }
  };

  const toggleVisibility = async (section: LandingSection) => {
    try {
      const updated = await apiFetch<LandingSection>(`/api/admin/landing/${section.id}`, {
        method: "PUT",
        token,
        body: { isVisible: !section.isVisible },
      });
      qc.setQueryData<LandingSection[]>(["admin-landing"], (prev) => (prev ?? []).map((s) => (s.id === updated.id ? updated : s)));
      toast.success(`${sectionLabel(section.sectionKey)} is now ${updated.isVisible ? "visible" : "hidden"}`);
    } catch {
      toast.error("Failed to update visibility");
    }
  };

  const moveSection = async (section: LandingSection, dir: -1 | 1) => {
    if (sections.length < 2) return;
    const idx = sections.findIndex((s) => s.id === section.id);
    const j = idx + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[idx], next[j]] = [next[j], next[idx]];
    const ordered = next.map((s, i) => ({ ...s, sortOrder: i }));
    qc.setQueryData(["admin-landing"], ordered);
    try {
      await apiFetch("/api/admin/landing/reorder", {
        method: "POST",
        token,
        body: { items: ordered.map((s) => ({ id: s.id, sortOrder: s.sortOrder })) },
      });
      toast.success("Order updated");
    } catch {
      toast.error("Failed to reorder sections");
      refetch();
    }
  };

  const isArraySection = (key: string) =>
    ["how_it_works", "stats", "features", "privacy_policy", "terms_of_service", "cookies_policy"].includes(key);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Visual Page Editor</h1>
          <p className="mt-1 text-sm text-muted-foreground">Click any section to edit - landing page and legal pages.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" /> View Page
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Section list */}
        <div className="space-y-3 lg:col-span-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <LayoutGrid className="h-5 w-5" /> Page Sections
          </h2>
          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading &&
            sections.map((section, index) => (
              <Card key={section.id} className={cn("transition-all hover:border-brand/50", !section.isVisible && "opacity-50")}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <IconBtn onClick={() => moveSection(section, -1)} disabled={index === 0} aria-label="Move section up">
                        <ArrowUp className="h-3 w-3" />
                      </IconBtn>
                      <IconBtn onClick={() => moveSection(section, 1)} disabled={index === sections.length - 1} aria-label="Move section down">
                        <ArrowDown className="h-3 w-3" />
                      </IconBtn>
                    </div>
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => openEditor(section)}>
                      <div className="flex items-center gap-2">
                        {sectionIcon(section.sectionKey)}
                        <p className="truncate font-medium">{sectionLabel(section.sectionKey)}</p>
                        {!section.isVisible && <Badge variant="outline" className="text-xs">Hidden</Badge>}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{section.title || "No title"}</p>
                    </div>
                    <div className="flex gap-1">
                      <IconBtn onClick={() => openEditor(section)} aria-label="Edit section">
                        <Edit3 className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn onClick={() => toggleVisibility(section)} aria-label={section.isVisible ? "Hide section" : "Show section"}>
                        {section.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </IconBtn>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        {/* Live preview */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="border-b py-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Eye className="h-4 w-4" /> Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <iframe src={`/?preview=${previewKey}`} className="h-[640px] w-full border-0" title="Landing Page Preview" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5" />
              {editing ? `Edit ${sectionLabel(editing.sectionKey)}` : "Edit Section"}
            </DialogTitle>
            <DialogDescription>Changes apply to the live page immediately after saving.</DialogDescription>
          </DialogHeader>

          {editing && (
            <Tabs
              defaultValue="content"
              className="w-full"
              onValueChange={(v) => setEditMode(v === "html" ? "html" : "visual")}
            >
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="content"><Type className="mr-1 h-4 w-4" /> Content</TabsTrigger>
                <TabsTrigger value="buttons"><Link2 className="mr-1 h-4 w-4" /> Buttons</TabsTrigger>
                <TabsTrigger value="settings"><Settings2 className="mr-1 h-4 w-4" /> Settings</TabsTrigger>
                <TabsTrigger value="html"><Code className="mr-1 h-4 w-4" /> HTML</TabsTrigger>
              </TabsList>

              <div className="mt-4 space-y-4">
                <TabsContent value="content" className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Title">
                      <Input value={editing.title ?? ""} onChange={(e) => patch("title", e.target.value)} placeholder="Section title" />
                    </Field>
                    <Field label="Subtitle / Badge">
                      <Input value={editing.subtitle ?? ""} onChange={(e) => patch("subtitle", e.target.value)} placeholder="Subtitle or badge text" />
                    </Field>
                  </div>

                  {editing.sectionKey === "how_it_works" && renderStepsEditor()}
                  {editing.sectionKey === "stats" && renderStatsEditor()}
                  {editing.sectionKey === "features" && renderFeaturesEditor()}
                  {["privacy_policy", "terms_of_service", "cookies_policy"].includes(editing.sectionKey) && renderLegalEditor()}

                  {!isArraySection(editing.sectionKey) && (
                    <Field label="Description / Content" help={editing.sectionKey === "faqs" ? "FAQ items are managed in Content > FAQs; this controls the FAQ block title and visibility." : undefined}>
                      <Textarea
                        value={editing.content ?? ""}
                        onChange={(e) => patch("content", e.target.value)}
                        placeholder="Section description"
                        rows={4}
                      />
                    </Field>
                  )}

                  <Field label="Background Image URL (optional)">
                    <Input value={editing.imageUrl ?? ""} onChange={(e) => patch("imageUrl", e.target.value)} placeholder="https://example.com/image.jpg" />
                  </Field>
                </TabsContent>

                <TabsContent value="buttons" className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Button Text">
                      <Input value={editing.buttonText ?? ""} onChange={(e) => patch("buttonText", e.target.value)} placeholder="Get Started" />
                    </Field>
                    <Field label="Button URL" help="Leave empty to use the WhatsApp start link.">
                      <Input value={editing.buttonUrl ?? ""} onChange={(e) => patch("buttonUrl", e.target.value)} placeholder="https://wa.me/..." />
                    </Field>
                  </div>
                  <div className="rounded-lg border bg-surface/40 p-4">
                    <p className="mb-2 text-sm text-muted-foreground">Button Preview:</p>
                    <Button variant="gradient">{editing.buttonText || "Button Text"}</Button>
                  </div>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <Label className="text-base">Section Visibility</Label>
                      <p className="text-sm text-muted-foreground">Show or hide this section on the live page</p>
                    </div>
                    <Switch checked={editing.isVisible} onCheckedChange={(c) => patch("isVisible", c)} />
                  </div>
                </TabsContent>

                <TabsContent value="html" className="space-y-4">
                  <div className="rounded-lg border border-amber-300/40 bg-amber-50 p-3 text-sm text-amber-800">
                    <strong>Advanced:</strong> Edit raw content. JSON array for steps/stats/features/legal sections, plain text for hero/cta sections.
                  </div>
                  <Textarea
                    value={htmlContent}
                    onChange={(e) => {
                      setHtmlContent(e.target.value);
                      setEditMode("html");
                    }}
                    className="font-mono text-sm"
                    rows={15}
                    placeholder="Raw content (JSON or plain text)"
                  />
                </TabsContent>
              </div>
            </Tabs>
          )}

          <DialogFooter className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>
              <Save className="mr-2 h-4 w-4" /> Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number, setter: (next: T[]) => void) {
  const next = [...arr];
  [next[a], next[b]] = [next[b], next[a]];
  setter(next);
}

function updateAt<T>(arr: T[], index: number, patchVal: Partial<T>, setter: (next: T[]) => void) {
  const next = arr.map((it, i) => (i === index ? { ...it, ...patchVal } : it));
  setter(next);
}