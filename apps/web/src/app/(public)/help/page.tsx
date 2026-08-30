"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, BookOpen, LifeBuoy } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

type Article = { id: string; title: string; slug: string; excerpt: string; category: string; updatedAt: string };

export default function HelpPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 400);

  const articlesQuery = useQuery({
    queryKey: ["help-articles", debounced, category, page],
    queryFn: () =>
      apiFetch<Article[]>(
        `/api/public/help-articles?page=${page}&limit=12&q=${encodeURIComponent(debounced)}${category !== "all" ? `&category=${encodeURIComponent(category)}` : ""}`
      ),
    placeholderData: (prev) => prev,
  });

  const categoriesQuery = useQuery({
    queryKey: ["help-categories"],
    queryFn: () => apiFetch<string[]>("/api/public/help-articles/categories"),
  });

  const data = articlesQuery.data as (Article[] & { page?: number; limit?: number; total?: number; totalPages?: number }) | undefined;
  const totalPages = (data?.totalPages as number) ?? 1;

  return (
    <Container className="py-10">
      <PageHeader title="Help Center" description="Guides, troubleshooting and everything you need to know about 400faqs." />

      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search help articles..."
            className="h-12 rounded-2xl pl-10"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setCategory("all");
            setPage(1);
          }}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            category === "all" ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
          )}
        >
          All
        </button>
        {(categoriesQuery.data ?? []).map((c) => (
          <button
            key={c}
            onClick={() => {
              setCategory(c);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              category === c ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {articlesQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : (data as Article[] | undefined)?.length === 0 || !data ? (
          <EmptyState icon={BookOpen} title="No articles found" description="We couldn't find anything matching your search." />
        ) : (
          <div className="space-y-3">
            {(data as Article[]).map((a) => (
              <Link
                key={a.id}
                href={`/help/${a.slug}`}
                className="group flex items-start gap-4 rounded-2xl border border-line bg-white p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-glass"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold group-hover:text-brand">{a.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.excerpt}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="gray">{a.category}</Badge>
                    <span className="text-xs text-muted-foreground">Updated {new Date(a.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} total={(data?.total as number) ?? 0} limit={12} onPageChange={setPage} className="mt-6" />
      </div>

      <div className="mt-16 rounded-3xl bg-gradient-brand p-10 text-center text-white">
        <LifeBuoy className="mx-auto h-10 w-10 text-white/80" />
        <h2 className="mt-4 text-2xl font-bold">Still need help?</h2>
        <p className="mx-auto mt-2 max-w-md text-white/80">Reach out to our support team and we'll get back to you.</p>
        <Link href="/contact" className="mt-6 inline-flex">
          <Button variant="brand" className="bg-white text-primary-700 hover:bg-white/90">
            Contact Support
          </Button>
        </Link>
      </div>
    </Container>
  );
}
