"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Award, Medal, Trophy } from "lucide-react";
import { apiFetch } from "@/lib/api";
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

const TOP_STYLES = [
  { icon: Trophy, badge: "bg-amber-100 text-amber-600", ring: "ring-amber-300" },
  { icon: Medal, badge: "bg-slate-200 text-slate-600", ring: "ring-slate-300" },
  { icon: Award, badge: "bg-orange-100 text-orange-700", ring: "ring-orange-300" },
];

export default function AppLeaderboardPage() {
  const top = useQuery<Entry[]>({
    queryKey: ["app-leaderboard"],
    queryFn: () => apiFetch("/api/public/leaderboard?limit=50"),
  });

  const data = top.data ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The most generous contributors on 400QUES. Only aggregated, privacy-protected data is shown.
        </p>
      </div>

      {top.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))}
        </div>
      ) : !data.length ? (
        <div className="rounded-2xl border border-line bg-white p-10 text-center">
          <Trophy className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 font-semibold">No contributions yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Be the first to claim the top spot!</p>
          <Link href="/app/contribute" className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline">
            Contribute now →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((e, i) => {
            const topStyle = i < 3 ? TOP_STYLES[i] : null;
            return (
              <div key={e.phone} className={cn("flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-soft", topStyle ? "border-brand/20 ring-2" : "border-line", topStyle?.ring)}>
                <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", topStyle ? topStyle.badge : "bg-surface")}>
                  {topStyle ? (
                    <topStyle.icon className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-bold text-muted-foreground">#{i + 1}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.name ?? maskPhone(e.phone)}</p>
                  <p className="text-sm text-muted-foreground">
                    {e.approved} approved · {e.pending} pending · {e.rejected} rejected
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">{e.contributions}</p>
                  <p className="text-xs text-muted-foreground">questions</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}