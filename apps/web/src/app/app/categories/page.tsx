"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowDownAZ, Clock, ListOrdered, PlayCircle, Search, TrendingUp } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { CategoryCard, type AppCategory } from "@/components/app/category-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

const SORTS = [
  { value: "newest", label: "Newest", icon: Clock },
  { value: "most_played", label: "Most Played", icon: PlayCircle },
  { value: "most_questions", label: "Most Questions", icon: ListOrdered },
  { value: "trending", label: "Trending", icon: TrendingUp },
  { value: "alphabetical", label: "A-Z", icon: ArrowDownAZ },
];

export default function AppCategoriesPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 400);

  const query = useQuery<AppCategory[] & { page?: number; totalPages?: number; total?: number }>({
    queryKey: ["app-categories", debounced, sort, page],
    queryFn: () =>
      apiFetch(`/api/public/categories?page=${page}&limit=12&q=${encodeURIComponent(debounced)}&sort=${sort}`),
    placeholderData: (prev) => prev,
  });

  const data = query.data;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Browse Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">Explore every question category on 400QUES.</p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search categories..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setSort(s.value);
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                sort === s.value ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
              )}
            >
              <s.icon className="h-3.5 w-3.5" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-white p-5">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <Skeleton className="mt-3 h-5 w-2/3" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1 h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={Search}
          title="No categories found"
          description={q ? `No categories match "${q}". Try a different search.` : "Categories are added by the community."}
          actionLabel="Request a Category"
          action={
            <Button asChild>
              <Link href="/app/request-category">Request a Category</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c) => (
              <CategoryCard key={c.id} c={c} />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={data?.total ?? 0} limit={12} onPageChange={setPage} className="mt-8" />
        </>
      )}
    </div>
  );
}