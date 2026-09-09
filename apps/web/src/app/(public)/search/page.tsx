"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Search, FolderOpen, HelpCircle, ArrowRight } from "lucide-react";
import { searchAll, type SearchResult as SearchResultData } from "@/lib/queries/public-client";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";

type SearchResult = SearchResultData;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 400);

  const query = useQuery<SearchResult>({
    queryKey: ["search", debounced],
    queryFn: () => searchAll(debounced),
    enabled: debounced.length >= 2,
  });

  const data = query.data;
  const hasResults = data && (data.categories.length > 0 || data.questions.length > 0 || data.articles.length > 0);

  return (
    <Container className="py-10">
      <PageHeader title="Search" description="Find categories, questions and help articles." />

      <div className="relative mx-auto max-w-2xl">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search 400faqs..."
          className="h-12 rounded-2xl pl-12 text-base"
          autoFocus
        />
      </div>

      <div className="mt-10 space-y-8">
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
                  <Link key={c.id} href={`/categories/${c.slug}`} className="group flex items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-soft transition-all hover:border-brand/30">
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
                {data.questions.map((q) => (
                  <Link key={q.id} href={`/categories/${q.categorySlug}`} className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-soft transition-all hover:border-brand/30">
                    <p className="flex-1 text-sm font-medium">{q.text}</p>
                    <Badge variant="gray">{q.categoryName}</Badge>
                    <Badge variant={q.type === "TRUTH" ? "purple" : q.type === "DARE" ? "orange" : "gray"}>{q.type === "NORMAL" ? "Question" : q.type}</Badge>
                  </Link>
                ))}
              </Section>
            )}
            {data.articles.length > 0 && (
              <Section title={`Help articles (${data.articles.length})`} icon={HelpCircle}>
                {data.articles.map((a) => (
                  <Link key={a.id} href={`/help/${a.slug}`} className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 shadow-soft transition-all hover:border-brand/30">
                    <p className="flex-1 text-sm font-medium">{a.title}</p>
                    <Badge variant="gray">{a.category}</Badge>
                  </Link>
                ))}
              </Section>
            )}
          </>
        )}
      </div>
    </Container>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Search; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Icon className="h-5 w-5 text-brand" /> {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
