"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { Save, Plus, Trash2, ArrowUp, ArrowDown, Eye, ExternalLink } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StepItem = { step: string; title: string; desc: string };
type FeatureItem = { icon: string; title: string; desc: string };

type SettingsMap = Record<string, string>;

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}
const stringify = (v: unknown) => JSON.stringify(v);

const DEFAULT_STEPS: StepItem[] = [
  { step: "1", title: "Message us", desc: "Open WhatsApp and send START to our number." },
  { step: "2", title: "Create a session", desc: "Get a unique invite code instantly." },
  { step: "3", title: "Invite your friend", desc: "Share the code — they join instantly." },
  { step: "4", title: "Pick a category", desc: "Truth, Dare, or hundreds of themes." },
  { step: "5", title: "Play", desc: "Alternate turns. Answer. Have fun." },
];

const DEFAULT_FEATURES: FeatureItem[] = [
  { icon: "♾️", title: "Unlimited Sessions", desc: "Create as many games as you want, any time." },
  { icon: "🗂️", title: "Hundreds of Categories", desc: "New themes added by the community constantly." },
  { icon: "🤝", title: "Community Questions", desc: "Anyone can contribute a question — AI checks quality." },
];

// All editaable landing fields (public so they reach the public site).
const LANDING_KEYS = [
  "site.name",
  "site.tagline",
  "site.hero.badge",
  "site.hero.subtitle",
  "landing.how.title",
  "landing.how.subtitle",
  "landing.features.title",
  "landing.features.subtitle",
  "landing.categories.title",
  "landing.categories.subtitle",
  "landing.faq.title",
  "landing.cta.title",
  "landing.cta.body",
];

export default function LandingEditorPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<SettingsMap | null>(null);

  const { data: settings, isLoading } = useQuery<SettingsMap>({
    queryKey: ["public-settings"],
    queryFn: () => apiFetch("/api/public/settings"),
  });

  const s: SettingsMap = draft ?? settings ?? {};

  const set = (key: string, value: string) => {
    const base = draft ?? settings ?? {};
    setDraft({ ...base, [key]: value });
  };

  // ---- Steps (How It Works block) ----
  const steps = parseJson<StepItem[]>(draft?.["landing.how.steps"] ?? settings?.["landing.how.steps"], DEFAULT_STEPS);
  const setStep = (i: number, patch: Partial<StepItem>) => {
    const next = steps.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    set("landing.how.steps", stringify(next));
  };
  const addStep = () => {
    const next = [...steps, { step: String(steps.length + 1), title: "", desc: "" }];
    set("landing.how.steps", stringify(next));
  };
  const removeStep = (i: number) => {
    const next = steps.filter((_, idx) => idx !== i).map((it, idx) => ({ ...it, step: String(idx + 1) }));
    set("landing.how.steps", stringify(next));
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    set("landing.how.steps", stringify(next.map((it, idx) => ({ ...it, step: String(idx + 1) }))));
  };

  // ---- Features block ----
  const features = parseJson<FeatureItem[]>(draft?.["landing.features.items"] ?? settings?.["landing.features.items"], DEFAULT_FEATURES);
  const setFeature = (i: number, patch: Partial<FeatureItem>) => {
    const next = features.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    set("landing.features.items", stringify(next));
  };
  const addFeature = () => set("landing.features.items", stringify([...features, { icon: "✨", title: "", desc: "" }]));
  const removeFeature = (i: number) => set("landing.features.items", stringify(features.filter((_, idx) => idx !== i)));
  const moveFeature = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= features.length) return;
    const next = [...features];
    [next[i], next[j]] = [next[j], next[i]];
    set("landing.features.items", stringify(next));
  };

  const save = useMutation({
    mutationFn: () => {
      const entries = LANDING_KEYS.map((key) => ({
        key,
        value: s[key] ?? "",
        public: true,
        group: "landing",
      }));
      entries.push({ key: "landing.how.steps", value: stringify(steps), public: true, group: "landing" });
      entries.push({ key: "landing.features.items", value: stringify(features), public: true, group: "landing" });
      return apiFetch("/api/admin/settings", { method: "PUT", token, body: { entries } });
    },
    onSuccess: async () => {
      toast.success("Landing page saved");
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["public-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  // ---- Preview data ----
  const siteName = s["site.name"] || "400faqs";
  const heroBadge = s["site.hero.badge"] || "Play inside WhatsApp";
  const heroSubtitle = s["site.hero.subtitle"] || "Two friends. One WhatsApp chat. Hundreds of questions.";
  const tagline = s["site.tagline"] || "The Ultimate WhatsApp Questions Game";
  const howTitle = s["landing.how.title"] || "How It Works";
  const howSubtitle = s["landing.how.subtitle"] || "From zero to game in under a minute. No signup, no app install.";
  const featuresTitle = s["landing.features.title"] || "Everything You Need";
  const featuresSubtitle = s["landing.features.subtitle"] || "A complete question game platform, built around WhatsApp.";
  const ctaTitle = s["landing.cta.title"] || "Ready to play?";
  const ctaBody = s["landing.cta.body"] || "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Landing Page Editor</h1>
          <p className="text-sm text-muted-foreground">
            Edit your landing copy live — preview updates as you type. Blocks are managed visually, no JSON needed.
          </p>
        </div>
        <Button onClick={() => save.mutate()} loading={save.isPending} className="gap-2">
          <Save className="h-4 w-4" /> {save.isPending ? "Saving..." : "Save Landing Page"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {/* Left: editor */}
          <div className="space-y-4">
            <Section title="Hero">
              <FieldRow>
                {inputFields(s, set, ["site.name", "site.tagline", "site.hero.badge", "site.hero.subtitle"])}
              </FieldRow>
            </Section>

            <Section title="How It Works">
              <FieldRow>
                {inputFields(s, set, ["landing.how.title", "landing.how.subtitle"])}
              </FieldRow>
              <div className="space-y-2">
                <Label>Steps</Label>
                {steps.map((st, i) => (
                  <div key={i} className="rounded-xl border border-line bg-surface/40 p-3">
                    <div className="flex items-start gap-2">
                      <Input
                        className="h-8 w-14 font-mono"
                        value={st.step}
                        onChange={(e) => setStep(i, { step: e.target.value })}
                        aria-label="Step number"
                      />
                      <div className="flex-1 space-y-2">
                        <Input value={st.title} placeholder="Step title" onChange={(e) => setStep(i, { title: e.target.value })} />
                        <Input value={st.desc} placeholder="Step description" onChange={(e) => setStep(i, { desc: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <IconBtn onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn onClick={() => removeStep(i)} aria-label="Remove step"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addStep} className="gap-1">
                  <Plus className="h-4 w-4" /> Add step
                </Button>
              </div>
            </Section>

            <Section title="Features">
              <FieldRow>
                {inputFields(s, set, ["landing.features.title", "landing.features.subtitle"])}
              </FieldRow>
              <div className="space-y-2">
                <Label>Features</Label>
                {features.map((f, i) => (
                  <div key={i} className="rounded-xl border border-line bg-surface/40 p-3">
                    <div className="flex items-start gap-2">
                      <Input
                        className="h-8 w-14 text-center"
                        value={f.icon}
                        onChange={(e) => setFeature(i, { icon: e.target.value })}
                        aria-label="Feature icon"
                      />
                      <div className="flex-1 space-y-2">
                        <Input value={f.title} placeholder="Feature title" onChange={(e) => setFeature(i, { title: e.target.value })} />
                        <Input value={f.desc} placeholder="Feature description" onChange={(e) => setFeature(i, { desc: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <IconBtn onClick={() => moveFeature(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn onClick={() => moveFeature(i, 1)} disabled={i === features.length - 1} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
                        <IconBtn onClick={() => removeFeature(i)} aria-label="Remove feature"><Trash2 className="h-3.5 w-3.5" /></IconBtn>
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addFeature} className="gap-1">
                  <Plus className="h-4 w-4" /> Add feature
                </Button>
              </div>
            </Section>

            <Section title="Trending + FAQ + CTA">
              <FieldRow>
                {inputFields(s, set, [
                  "landing.categories.title",
                  "landing.categories.subtitle",
                  "landing.faq.title",
                  "landing.cta.title",
                  "landing.cta.body",
                ])}
              </FieldRow>
            </Section>
          </div>

          {/* Right: live preview */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Eye className="h-3.5 w-3.5" /> Live preview
              </p>
              <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> Open public site
              </a>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line shadow-soft">
              <div className="flex h-8 items-center gap-1.5 border-b border-line bg-surface px-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                <span className="ml-2 truncate text-xs text-muted-foreground">/</span>
              </div>
              <div className="max-h-[70vh] overflow-y-auto bg-white p-6 text-sm">
                <h2 className="gradient-text text-2xl font-black">{siteName}</h2>
                <p className="mt-1 font-semibold">{tagline}</p>
                <span className="mt-2 inline-block rounded-full border border-primary/20 bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary-700">
                  {heroBadge}
                </span>
                <p className="mt-2 text-muted-foreground">{heroSubtitle}</p>

                <div className="mt-6">
                  <h3 className="text-lg font-bold">{howTitle}</h3>
                  <p className="text-xs text-muted-foreground">{howSubtitle}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {steps.map((st, i) => (
                      <div key={i} className="rounded-xl border border-line bg-surface/40 p-2 text-center">
                        <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand text-xs font-bold text-white">
                          {st.step}
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs font-semibold">{st.title}</p>
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">{st.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-bold">{featuresTitle}</h3>
                  <p className="text-xs text-muted-foreground">{featuresSubtitle}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {features.map((f, i) => (
                      <div key={i} className="rounded-xl border border-line bg-surface/40 p-2">
                        <div className="text-lg">{f.icon}</div>
                        <p className="line-clamp-1 text-xs font-semibold">{f.title}</p>
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">{f.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 rounded-xl bg-gradient-brand p-4 text-center text-white">
                  <h3 className="text-lg font-bold">{ctaTitle}</h3>
                  <p className="mt-1 text-xs text-white/80">{ctaBody}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

const keyLabel: Record<string, string> = {
  "site.name": "Site name",
  "site.tagline": "Tagline",
  "site.hero.badge": "Hero badge pill",
  "site.hero.subtitle": "Hero subtitle",
  "landing.how.title": "How It Works title",
  "landing.how.subtitle": "How It Works subtitle",
  "landing.features.title": "Features title",
  "landing.features.subtitle": "Features subtitle",
  "landing.categories.title": "Trending categories title",
  "landing.categories.subtitle": "Trending categories subtitle",
  "landing.faq.title": "FAQ title",
  "landing.cta.title": "CTA title",
  "landing.cta.body": "CTA body text",
};

const TEXTAREA_KEYS = new Set(["landing.how.subtitle", "landing.features.subtitle", "landing.cta.body"]);

function inputFields(s: SettingsMap, set: (k: string, v: string) => void, keys: string[]) {
  return keys.map((key) => (
    <div key={key} className="space-y-1.5">
      <Label>{keyLabel[key] ?? key}</Label>
      {TEXTAREA_KEYS.has(key) ? (
        <Textarea value={s[key] ?? ""} onChange={(e) => set(key, e.target.value)} rows={3} />
      ) : (
        <Input value={s[key] ?? ""} onChange={(e) => set(key, e.target.value)} />
      )}
    </div>
  ));
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
