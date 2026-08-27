"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { MessageCirclePlus, Search } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePhone } from "@/hooks/use-phone";
import { PhoneGate } from "@/components/app/phone-gate";
import { AiBadge, StatusPill } from "@/components/app/status-pill";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";

type Contribution = {
  id: string;
  ticket: string;
  question: string;
  type: "TRUTH" | "DARE" | "NORMAL";
  status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  rejectionReason: string | null;
  category: { id: string; slug: string; name: string };
  duplicateOf: { id: string; text: string } | null;
  classification: string | null;
  createdAt: string;
};

type ListResponse = Contribution[] & { page?: number; totalPages?: number; total?: number };

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "FLAGGED", label: "Flagged" },
];

export default function AppContributionsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My Question Contributions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track the status of every question you've submitted.</p>
      </div>
      <PhoneGate>
        <Inner />
      </PhoneGate>
    </div>
  );
}

function Inner() {
  const { phone } = usePhone();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery<ListResponse>({
    queryKey: ["app-contributions", phone, status, q, page],
    queryFn: () => {
      const params = new URLSearchParams({ phone: encodeURIComponent(phone), page: String(page), limit: "10" });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      return apiFetch(`/api/public/contributions?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const data = query.data;

  return (
    <div>
      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search your questions…"
            className="w-full rounded-full border border-line bg-white py-2 pl-9 pr-4 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                status === f.value ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={Search}
          title="No contributions"
          description={status ? `No ${status.toLowerCase()} contributions.` : "Questions you submit will appear here."}
          actionLabel="Contribute a question"
          action={
            <Button asChild>
              <Link href="/app/contribute">Contribute a question</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.map((c) => (
            <div key={c.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-relaxed">{c.question}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Link href={`/app/categories/${c.category.slug}`} className="font-semibold text-brand hover:underline">
                      {c.category.name}
                    </Link>
                    <span>·</span>
                    <span className="font-mono">{c.ticket}</span>
                    <span>·</span>
                    <span>{formatDate(c.createdAt)}</span>
                  </div>
                  {c.duplicateOf && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                      Marked as a duplicate of: "{c.duplicateOf.text.slice(0, 80)}"
                    </p>
                  )}
                  {c.rejectionReason && (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{c.rejectionReason}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusPill status={c.status} />
                  <AiBadge classification={c.classification} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} limit={10} onPageChange={setPage} className="mt-6" />
    </div>
  );
}