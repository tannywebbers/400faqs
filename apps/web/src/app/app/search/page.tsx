"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight, FolderOpen, HelpCircle, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";

type SearchResult = {
  categories: { id: string; name: string; slug: string; icon: string; questionCount: number }[];
  questions: { id: string; text: string; type: string; categoryName: string; categorySlug: string }[];
  articles: { id: string; title: string; slug: string; category: string }[];
};

export default function AppSearchPage() {
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 400);

  const query = useQuery<SearchResult>({
    queryKey: ["app-search", debounced],
    queryFn: () => apiFetch(`/api/public/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 2,
  });

  const data = query.data;
  const hasResults = data && (data.categories.length > 0 || data.questions.length > 0 || data.articles.length > 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">Find categories, questions and help articles.</p>
      </div>

      <div className="relative max-w-2xl">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search 400QUES..."
          className="h-12 rounded-2xl pl-12 text-base"
          autoFocus
        />
      </div>

      <div className="mt-8 space-y-8">
        {debounced.length < 2 ? (
          <p className="text-center text-sm text-muted-foreground">Type at least 2 characters to search.</p>
        ) : query.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </div>
        ) : !hasResults ? (
          <p className="text-center text-sm text-muted-foreground">No results for "{debounced}".</p>
        ) : (
          <>
            {data.categories.length > 0 && (
              <Section title={`Categories (${data.categories.length})`} icon={FolderOpen}>
                {data.categories.map((c) => (
                  <Link key={c.id} href={`/app/categories/${c.slug}`} className="group flex items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-soft transition-all hover:border-brand/30">
                    <span className="text-xl">{c.icon}</span>
                    <span className="flex-1 font-medium group-hover:text-brand">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.questionCount} questions</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </Section>
            )}
            {data.questions.length > 0 && (
              <Section title={`Questions (${data.questions.length})`} icon={Search}>
                {data.questions.map((qu) => (
                  <Link key={qu.id} href={`/app/categories/${qu.categorySlug}`} className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-soft transition-all hover:border-brand/30">
                    <p className="flex-1 text-sm font-medium">{qu.text}</p>
                    <Badge variant="gray">{qu.categoryName}</Badge>
                    <Badge variant={qu.type === "TRUTH" ? "purple" : qu.type === "DARE" ? "orange" : "gray"}>{qu.type === "NORMAL" ? "Question" : qu.type}</Badge>
                  </Link>
                ))}
              </Section>
            )}
            {data.articles.length > 0 && (
              <Section title={`Help articles (${data.articles.length})`} icon={HelpCircle}>
                {data.articles.map((a) => (
                  <Link key={a.id} href={`/app/help/${a.slug}`} className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-soft transition-all hover:border-brand/30">
                    <p className="flex-1 text-sm font-medium">{a.title}</p>
                    <Badge variant="gray">{a.category}</Badge>
                  </Link>
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof FolderOpen; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-5 w-5 text-brand" /> {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}