import type { Metadata } from "next";
import { apiUrl } from "@/lib/api";
import { Container } from "@/components/layout/container";

async function getSettings() {
  try {
    const res = await fetch(apiUrl("/api/public/settings"), { next: { revalidate: 300 } });
    if (res.ok) {
      const payload = (await res.json()) as { data: Record<string, string> };
      return payload.data;
    }
  } catch {
    /* fallback */
  }
  return {} as Record<string, string>;
}

export const metadata: Metadata = { title: "Privacy Policy", description: "How 400faqs handles your data." };

export default async function PrivacyPage() {
  const settings = await getSettings();
  const content = settings["privacy.content"] ?? "Privacy Policy";
  const lastUpdated = settings["privacy.lastUpdated"];

  return (
    <Container className="py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        {lastUpdated && <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>}
        <div className="prose prose-slate mt-8 whitespace-pre-line rounded-3xl border border-line bg-white p-8 text-[15px] leading-relaxed text-ink shadow-soft">
          {content}
        </div>
      </div>
    </Container>
  );
}
