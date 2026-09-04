"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, TrendingUp, Clock, PlayCircle, ListOrdered, ArrowDownAZ } from "lucide-react";
import { fetchPublicCategories, type CategoryListItem } from "@/lib/queries/public-client";
import { PageHeader } from "@/components/page-header";
import { Container } from "@/components/layout/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

type Category = CategoryListItem;

const SORTS = [
  { value: "newest", label: "Newest", icon: Clock },
  { value: "most_played", label: "Most Played", icon: PlayCircle },
  { value: "most_questions", label: "Most Questions", icon: ListOrdered },
  { value: "trending", label: "Trending", icon: TrendingUp },
  { value: "alphabetical", label: "Alphabetical", icon: ArrowDownAZ },
];

export default function CategoriesPage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 400);

  const query = useQuery({
    queryKey: ["public-categories", debounced, sort, page],
    queryFn: () => fetchPublicCategories({ page, limit: 12, q: debounced, sort }),
    placeholderData: (prev) => prev,
  });

  const data = query.data as (Category[] & { page?: number; limit?: number; total?: number; totalPages?: number }) | undefined;
  const totalPages = (data?.totalPages as number) ?? 1;

  return (
    <Container className="py-10">
      <PageHeader title="Categories" description="Browse hundreds of question categories, contributed by our community." />

      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-line bg-white p-6">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <Skeleton className="mt-4 h-5 w-2/3" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1 h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : (data as Category[] | undefined)?.length === 0 || !data ? (
        <EmptyState
          title="No categories found"
          description={q ? `No categories match "${q}". Try a different search.` : "Categories are added by the community. Be the first to contribute."}
          actionLabel="Request a Category"
          action={<Link href="/request-category" className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-white">Request a Category</Link>}
        />
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {(data as Category[]).map((c) => (
              <Link key={c.id} href={`/categories/${c.slug}`} className="glass card-hover rounded-2xl p-6">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl text-xl" style={{ backgroundColor: `${c.color}18`, color: c.color }}>
                    {c.icon}
                  </div>
                  {c.trending && (
                    <Badge variant="orange" className="gap-1">
                      <TrendingUp className="h-3 w-3" /> Trending
                    </Badge>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{c.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                <div className="mt-4 flex items-center gap-4 text-xs font-medium text-muted-foreground">
                  <span>{c.questionCount.toLocaleString()} questions</span>
                  <span>{c.playCount.toLocaleString()} plays</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">by {c.createdByName}</p>
              </Link>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={(data?.total as number) ?? 0} limit={12} onPageChange={setPage} className="mt-8" />
        </>
      )}
    </Container>
  );
}
