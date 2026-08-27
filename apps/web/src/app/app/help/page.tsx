"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

type Article = { id: string; title: string; slug: string; excerpt: string; category: string; updatedAt: string };

export default function AppHelpPage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 400);

  const articles = useQuery<Article[] & { page?: number; totalPages?: number; total?: number }>({
    queryKey: ["app-help", debounced, category, page],
    queryFn: () =>
      apiFetch(
        `/api/public/help-articles?page=${page}&limit=8&q=${encodeURIComponent(debounced)}${category !== "all" ? `&category=${encodeURIComponent(category)}` : ""}`
      ),
    placeholderData: (prev) => prev,
  });

  const categories = useQuery<string[]>({
    queryKey: ["app-help-categories"],
    queryFn: () => apiFetch("/api/public/help-articles/categories"),
  });

  const data = articles.data;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Help Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">Guides and answers for everything 400QUES.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search help articles..."
          className="h-11 rounded-2xl pl-9"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
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
        {(categories.data ?? []).map((c) => (
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

      <div className="mt-6">
        {articles.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : !data?.length ? (
          <EmptyState icon={BookOpen} title="No articles found" description="We couldn't find anything matching your search." />
        ) : (
          <div className="space-y-3">
            {data.map((a) => (
              <Link
                key={a.id}
                href={`/app/help/${a.slug}`}
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

        <Pagination page={page} totalPages={totalPages} total={data?.total ?? 0} limit={8} onPageChange={setPage} className="mt-6" />
      </div>
    </div>
  );
}