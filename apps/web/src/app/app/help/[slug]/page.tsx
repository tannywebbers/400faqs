import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

type Article = { id: string; title: string; content: string; category: string; updatedAt: string };

async function fetchArticle(slug: string): Promise<Article | null> {
  try {
    const res = await fetch(apiUrl(`/api/public/help-articles/${slug}`), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const payload = (await res.json()) as { data: Article };
    return payload.data;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const article = await fetchArticle(params.slug);
  if (!article) return { title: "Article Not Found" };
  return { title: article.title, description: article.content.slice(0, 160) };
}

export default async function AppArticlePage({ params }: { params: { slug: string } }) {
  const article = await fetchArticle(params.slug);
  if (!article) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/app" className="hover:text-ink">Dashboard</Link> /{" "}
        <Link href="/app/help" className="hover:text-ink">Help</Link> /{" "}
        <span className="font-medium text-ink">{article.title}</span>
      </nav>

      <article className="rounded-3xl border border-line bg-white p-8 shadow-soft sm:p-10">
        <Badge>{article.category}</Badge>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{article.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated {new Date(article.updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>
        <div className="prose prose-slate mt-8 max-w-none whitespace-pre-line text-[15px] leading-relaxed text-ink [&_a]:text-brand [&_a]:underline">
          {article.content}
        </div>
      </article>

      <div className="mt-6 text-center">
        <Link href="/app/help" className="text-sm font-semibold text-brand hover:underline">
          ← Back to Help Center
        </Link>
      </div>
    </div>
  );
}