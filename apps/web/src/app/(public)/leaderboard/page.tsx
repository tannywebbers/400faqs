"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal, Award } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { maskPhone } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Entry = {
  phone: string;
  name: string | null;
  contributions: number;
  approved: number;
  rejected: number;
  pending: number;
  badges: number;
};

const RANK_STYLES = [
  { icon: Trophy, label: "text-amber-600 bg-amber-100", ring: "ring-amber-300" },
  { icon: Medal, label: "text-slate-600 bg-slate-200", ring: "ring-slate-300" },
  { icon: Award, label: "text-orange-700 bg-orange-100", ring: "ring-orange-300" },
];

export default function LeaderboardPage() {
  const query = useQuery<Entry[]>({
    queryKey: ["leaderboard"],
    queryFn: () => apiFetch("/api/public/leaderboard"),
  });

  const data = query.data ?? [];

  return (
    <Container className="py-10">
      <PageHeader title="Leaderboard" description="Top contributors on 400QUES. Personal data is aggregated and privacy-protected." />

      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-semibold">No contributions yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Be the first to claim the top spot!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((entry, i) => {
            const rank = i < 3 ? RANK_STYLES[i] : null;
            return (
              <div
                key={entry.phone}
                className={cn("flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-soft", i < 3 ? "border-brand/20 ring-2" : "border-line", rank?.ring)}
              >
                <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", rank ? rank.label : "bg-surface")}>
                  {rank ? (
                    <rank.icon className="h-6 w-6" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">#{i + 1}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{entry.name ?? maskPhone(entry.phone)}</p>
                  <p className="text-sm text-muted-foreground">
                    {entry.approved} approved · {entry.pending} pending · {entry.rejected} rejected
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{entry.contributions}</p>
                  <p className="text-xs text-muted-foreground">questions</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Container>
  );
}
