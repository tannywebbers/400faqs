"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
  FolderOpen,
  Layers,
  MessageCirclePlus,
  Send,
  Trophy,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PhoneGate, PhoneBar } from "@/components/app/phone-gate";
import { CategoryCard } from "@/components/app/category-card";
import { AiBadge, StatusPill } from "@/components/app/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { usePhone } from "@/hooks/use-phone";
import { formatDate } from "@/lib/utils";

type Profile = {
  phone: string;
  user: {
    displayName: string | null;
    totalSessions: number;
    totalAnswered: number;
    totalAsked: number;
  } | null;
  badges: { id: string; name: string; slug: string; icon: string; color: string; awardedAt: string }[];
  contributionCounts: Record<string, number>;
  reportCounts: Record<string, number>;
  categoryRequestCounts: Record<string, number>;
  recent: {
    contributions: { id: string; ticket: string; question: string; status: string; categoryName: string; classification: string | null; createdAt: string }[];
    reports: { id: string; ticket: string; reason: string; status: string; createdAt: string }[];
    categoryRequests: { id: string; name: string; status: string; createdAt: string }[];
  };
};

function DashboardInner() {
  const { phone } = usePhone();
  const profile = useQuery<Profile>({
    queryKey: ["profile", phone],
    queryFn: () => apiFetch(`/api/public/profile?phone=${encodeURIComponent(phone)}`),
  });

  const trending = useQuery<Category[]>({
    queryKey: ["app-categories", "trending"],
    queryFn: () => apiFetch("/api/public/categories?type=trending&limit=3&sort=trending") as Promise<Category[]>,
    select: (items: Category[]) => items,
  });

  const data = profile.data;
  const counts = data?.contributionCounts ?? {};
  const approved = counts.APPROVED ?? 0;
  const pending = counts.PENDING ?? 0;
  const rejected = counts.REJECTED ?? 0;
  const reportsOpen = (data?.reportCounts.OPEN ?? 0) + (data?.reportCounts.IN_PROGRESS ?? 0);
  const requestsPending = data?.categoryRequestCounts.PENDING ?? 0;

  return (
    <div>
      <PhoneBar />

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {data?.user?.displayName ? `Hi, ${data.user.displayName}` : "Your 400QUES Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything you've contributed, reported and requested.</p>
        </div>
        <Link href="/app/contribute" className="inline-flex">
          <Button>
            <MessageCirclePlus className="h-4 w-4" /> Contribute a question
          </Button>
        </Link>
      </div>

      {profile.isLoading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat icon={CheckCircle2} tone="text-emerald-600" label="Approved" value={approved} href="/app/contributions" />
            <Stat icon={Clock} tone="text-amber-600" label="Pending" value={pending} href="/app/contributions" />
            <Stat icon={XCircle} tone="text-red-600" label="Rejected" value={rejected} href="/app/contributions" />
            <Stat icon={Flag} tone="text-blue-600" label="Reports open" value={reportsOpen} href="/app/reports" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <section>
                <SectionHeading href="/app/contributions" title="Recent contributions" linkLabel="All contributions">
                  {data?.recent.contributions.length ? (
                    data.recent.contributions.map((c) => (
                      <div key={c.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-white p-4">
                        <div className="min-w-0">
                          <p className="line-clamp-1 text-sm font-medium">{c.question}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {c.categoryName} · Ticket {c.ticket} · {formatDate(c.createdAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusPill status={c.status} />
                          <AiBadge classification={c.classification} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyRow text="No contributions yet. Be the first to add a question!" href="/app/contribute" action="Contribute now" />
                  )}
                </SectionHeading>
              </section>

              <section>
                <SectionHeading href="/app/reports" title="Recent reports" linkLabel="All reports">
                  {data?.recent.reports.length ? (
                    data.recent.reports.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{r.reason.replace(/_/g, " ")}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Ticket {r.ticket} · {formatDate(r.createdAt)}</p>
                        </div>
                        <StatusPill status={r.status} />
                      </div>
                    ))
                  ) : (
                    <EmptyRow text="No reports submitted." href="/app/report" action="Report a question" />
                  )}
                </SectionHeading>
              </section>

              <section>
                <SectionHeading href="/app/requests" title="Category requests" linkLabel="All requests">
                  {data?.recent.categoryRequests.length ? (
                    data.recent.categoryRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                        </div>
                        <StatusPill status={r.status} />
                      </div>
                    ))
                  ) : (
                    <EmptyRow text="No category requests yet." href="/app/request-category" action="Request a category" />
                  )}
                </SectionHeading>
              </section>
            </div>

            <div className="space-y-6">
              <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
                <h3 className="text-sm font-semibold">Quick actions</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <QuickLink href="/app/contribute" icon={Send} label="Contribute" />
                  <QuickLink href="/app/report" icon={Flag} label="Report" />
                  <QuickLink href="/app/request-category" icon={Layers} label="New category" />
                  <QuickLink href="/app/categories" icon={FolderOpen} label="Browse" />
                </div>
              </section>

              <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Your badges</h3>
                  {!data && <Skeleton className="h-4 w-16" />}
                </div>
                {data && data.badges.length === 0 && (
                  <p className="mt-2 text-sm text-muted-foreground">No badges yet. Keep contributing to earn rewards!</p>
                )}
                {data && data.badges.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {data.badges.map((b) => (
                      <span
                        key={b.id}
                        title={`${b.name} · earned ${formatDate(b.awardedAt)}`}
                        className="flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs font-medium"
                      >
                        <span className="text-sm">{b.icon}</span> {b.name}
                      </span>
                    ))}
                  </div>
                )}
                {data?.user && (
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
                    <MiniStat label="Sessions" value={data.user.totalSessions} />
                    <MiniStat label="Answered" value={data.user.totalAnswered} />
                    <MiniStat label="Asked" value={data.user.totalAsked} />
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Trophy className="h-4 w-4 text-amber-500" /> Trending categories
                  </h3>
                  <Link href="/app/leaderboard" className="text-xs font-semibold text-brand hover:underline">
                    Leaderboard
                  </Link>
                </div>
                {trending.isLoading ? (
                  <div className="mt-3 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {trending.data?.length ? (
                      trending.data.map((c) => (
                        <Link key={c.id} href={`/app/categories/${c.slug}`} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 transition-colors hover:bg-brand/5">
                          <span className="text-xl">{c.icon}</span>
                          <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{c.questionCount}</span>
                        </Link>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No categories yet.</p>
                    )}
                  </div>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AppDashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PhoneGate>
        <DashboardInner />
      </PhoneGate>
    </div>
  );
}

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  questionCount: number;
  playCount: number;
  trending: boolean;
};

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  href,
}: {
  icon: typeof CheckCircle2;
  tone: string;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href} className="rounded-2xl border border-line bg-white p-4 shadow-soft transition-colors hover:border-brand/30">
      <Icon className={`h-5 w-5 ${tone}`} />
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}

function SectionHeading({ title, linkLabel, href, children }: { title: string; linkLabel: string; href: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          {linkLabel} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyRow({ text, action, href }: { text: string; action: string; href: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line bg-white/50 p-4">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Link href={href} className="shrink-0 text-xs font-semibold text-brand hover:underline">
        {action} →
      </Link>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof Send; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-3 text-xs font-medium text-muted-foreground transition-colors hover:border-brand/30 hover:text-ink">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-bold">{value.toLocaleString()}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}