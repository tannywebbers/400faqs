"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Flag, HelpCircle, MessageCirclePlus, Play, Search, TrendingUp } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { TypeBadge } from "@/components/app/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";
import { useDebounce } from "@/hooks/use-debounce";
import { cn, formatDate } from "@/lib/utils";

type CategoryDetail = {
  id: string;
  name: string;
  slug: string;
  description: string;
  rules: string | null;
  icon: string;
  color: string;
  gameType: "NORMAL" | "TRUTH_DARE";
  questionCount: number;
  playCount: number;
  trending: boolean;
  contributorCount: number;
};

type Question = {
  id: string;
  text: string;
  type: "TRUTH" | "DARE" | "NORMAL";
  number: number;
  difficulty: number;
  playsCount: number;
  createdAt: string;
};

type ListResponse = Question[] & {
  page?: number;
  totalPages?: number;
  total?: number;
  category?: { name: string; gameType: "NORMAL" | "TRUTH_DARE" };
};

const TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "TRUTH", label: "Truth" },
  { value: "DARE", label: "Dare" },
  { value: "NORMAL", label: "Questions" },
];

export default function AppCategoryBrowsePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [difficulty, setDifficulty] = useState("any");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const debounced = useDebounce(q, 400);

  const detail = useQuery<CategoryDetail>({
    queryKey: ["app-category", slug],
    queryFn: () => apiFetch(`/api/public/categories/${slug}`),
  });

  const list = useQuery<ListResponse>({
    queryKey: ["app-category-questions", slug, debounced, type, difficulty, sort, page],
    queryFn: () => {
      const paramsArr = new URLSearchParams({ page: String(page), limit: "10", sort });
      if (debounced) paramsArr.set("q", debounced);
      if (type !== "all") paramsArr.set("type", type);
      if (difficulty !== "any") paramsArr.set("difficulty", difficulty);
      return apiFetch(`/api/public/categories/${slug}/questions?${paramsArr.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const c = detail.data;
  const data = list.data;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/app" className="hover:text-ink">Dashboard</Link> /{" "}
        <Link href="/app/categories" className="hover:text-ink">Categories</Link> /{" "}
        <span className="font-medium text-ink">{c?.name ?? slug}</span>
      </nav>

      {c ? (
        <div className="rounded-3xl border border-line bg-white p-6 shadow-soft sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl" style={{ backgroundColor: `${c.color}18`, color: c.color }}>
                {c.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
                  {c.trending && (
                    <Badge variant="orange" className="gap-1">
                      <TrendingUp className="h-3 w-3" /> Trending
                    </Badge>
                  )}
                  {c.gameType === "TRUTH_DARE" && <Badge variant="purple">Truth or Dare</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-3 gap-3">
              <MiniStat label="Questions" value={c.questionCount} />
              <MiniStat label="Plays" value={c.playCount} />
              <MiniStat label="Contributors" value={c.contributorCount} />
            </div>
          </div>

          {c.rules && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
              <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <p className="text-sm text-muted-foreground">{c.rules}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/app/contribute" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-brand px-4 text-sm font-semibold text-white shadow-soft transition-opacity hover:opacity-90">
              <MessageCirclePlus className="h-4 w-4" /> Contribute to this category
            </Link>
            <Link href="/app/report" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface">
              <Flag className="h-4 w-4" /> Report a question
            </Link>
          </div>
        </div>
      ) : (
        detail.isLoading && <Skeleton className="h-56 w-full rounded-3xl" />
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search questions..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c?.gameType === "TRUTH_DARE" &&
            TYPE_OPTIONS.filter((t) => t.value !== "NORMAL").map((t) => (
              <FilterChip key={t.value} active={type === t.value} onClick={() => { setType(t.value); setPage(1); }}>
                {t.label}
              </FilterChip>
            ))}
          {c?.gameType === "NORMAL" &&
            TYPE_OPTIONS.filter((t) => t.value === "all" || t.value === "NORMAL").map((t) => (
              <FilterChip key={t.value} active={type === t.value} onClick={() => { setType(t.value); setPage(1); }}>
                {t.label}
              </FilterChip>
            ))}
          <FilterChip active={sort === "newest"} onClick={() => setSort("newest")}>Newest</FilterChip>
          <FilterChip active={sort === "plays"} onClick={() => setSort("plays")}>Most played</FilterChip>
        </div>
      </div>

      <div className="mt-6">
        {list.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : !data?.length ? (
          <EmptyState
            icon={Search}
            title="No questions found"
            description={q ? `No questions match "${q}".` : "This category has no questions yet."}
            actionLabel="Contribute the first one"
            action={
              <Button asChild>
                <Link href="/app/contribute">Contribute a question</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {data.map((qu) => (
              <div key={qu.id} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-soft">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-semibold text-muted-foreground">
                  {qu.number}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-relaxed">{qu.text}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <TypeBadge type={qu.type} />
                    <Badge variant="gray">{qu.difficulty}★</Badge>
                    <span className="text-xs text-muted-foreground">{qu.playsCount} plays · added {formatDate(qu.createdAt)}</span>
                  </div>
                </div>
                <Play className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40" />
              </div>
            ))}
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} total={data?.total ?? 0} limit={10} onPageChange={setPage} className="mt-6" />
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
      )}
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-center">
      <p className="font-bold">{value.toLocaleString()}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}