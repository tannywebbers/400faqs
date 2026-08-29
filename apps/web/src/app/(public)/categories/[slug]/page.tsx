import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Flag, Users, HelpCircle, BookOpen } from "lucide-react";
import { whatsappLink } from "@/lib/utils";
import Link from "next/link";
import { AdPlacement } from "@/components/ad/ad-placement";

type CategoryDetail = {
  id: string;
  name: string;
  slug: string;
  description: string;
  rules: string | null;
  icon: string;
  color: string;
  questionCount: number;
  playCount: number;
  trending: boolean;
  contributorCount: number;
  reportCount: number;
  createdByName: string;
  recentlyAdded: { id: string; text: string; type: "TRUTH" | "DARE" | "NORMAL" }[];
};

async function fetchCategory(slug: string): Promise<CategoryDetail | null> {
  try {
    const res = await fetch(apiUrl(`/api/public/categories/${slug}`), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const payload = (await res.json()) as { data: CategoryDetail };
    return payload.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const category = await fetchCategory(params.slug);
  if (!category) return { title: "Category Not Found" };
  return {
    title: `${category.name} Category`,
    description: category.description.slice(0, 160),
  };
}

export default async function CategoryDetailPage({ params }: { params: { slug: string } }) {
  const category = await fetchCategory(params.slug);
  if (!category) notFound();

  const waNumber = "";

  return (
    <Container className="py-10">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-ink">Home</Link> /{" "}
        <Link href="/categories" className="hover:text-ink">Categories</Link> /{" "}
        <span className="font-medium text-ink">{category.name}</span>
      </nav>

      <div className="glass rounded-3xl p-8 sm:p-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl" style={{ backgroundColor: `${category.color}18`, color: category.color }}>
              {category.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">{category.name}</h1>
                {category.trending && <Badge variant="orange">Trending</Badge>}
              </div>
              <p className="mt-2 max-w-2xl text-muted-foreground">{category.description}</p>
              <p className="mt-3 text-xs text-muted-foreground">Curated by {category.createdByName}</p>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Questions" value={category.questionCount} />
            <Stat label="Plays" value={category.playCount} />
            <Stat label="Contributors" value={category.contributorCount} />
            <Stat label="Reports" value={category.reportCount} />
          </div>
        </div>

        {category.rules && (
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
            <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div>
              <p className="text-sm font-semibold">Rules</p>
              <p className="mt-1 text-sm text-muted-foreground">{category.rules}</p>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          {waNumber && (
            <a
              href={whatsappLink(waNumber, "START")}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-brand px-5 text-sm font-semibold text-white shadow-soft transition-all hover:opacity-90"
            >
              <MessageCircle className="h-4 w-4" /> Play this category
            </a>
          )}
          <Link
            href="/contribute"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-5 text-sm font-semibold text-ink shadow-soft transition-all hover:bg-surface"
          >
            Contribute a question
          </Link>
          <Link
            href="/report"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-5 text-sm font-semibold text-ink shadow-soft transition-all hover:bg-surface"
          >
            <Flag className="h-4 w-4" /> Report a question
          </Link>
        </div>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand" />
            <h2 className="text-xl font-semibold">Recently Added Questions</h2>
          </div>
          {category.recentlyAdded.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-white/50 p-10 text-center text-sm text-muted-foreground">
              No questions in this category yet. Be the first to contribute!
            </div>
          ) : (
            <div className="space-y-3">
              {category.recentlyAdded.map((q, i) => (
                <div key={q.id} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{q.text}</p>
                    <Badge
                      variant={q.type === "TRUTH" ? "purple" : q.type === "DARE" ? "orange" : "gray"}
                      className="mt-2"
                    >
                      {q.type === "NORMAL" ? "Question" : q.type}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-soft">
            <h3 className="flex items-center gap-2 font-semibold">
              <Users className="h-5 w-5 text-brand" /> Community
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {category.contributorCount} people contributed questions to this category.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-white p-6 shadow-soft">
            <h3 className="font-semibold">How to play</h3>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. Message our WhatsApp number and send START</li>
              <li>2. Get your invite code</li>
              <li>3. Share your invite code</li>
              <li>4. Pick the {category.name} category</li>
              <li>5. Play!</li>
            </ol>
          </div>

          {/* Provider-agnostic ad placement (CATEGORY_PAGE).
              Renders only if monetization is enabled and a provider serves
              this placement. Never exposes provider credentials. */}
          <AdPlacement placement="CATEGORY_PAGE" className="space-y-3" />
        </div>
      </div>
    </Container>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
      <p className="text-xl font-bold">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
