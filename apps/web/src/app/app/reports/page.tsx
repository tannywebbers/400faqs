"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Flag, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePhone } from "@/hooks/use-phone";
import { PhoneGate } from "@/components/app/phone-gate";
import { StatusPill } from "@/components/app/status-pill";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";

type Report = {
  id: string;
  ticket: string;
  reason: string;
  notes: string | null;
  screenshotUrl: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  resolution: string | null;
  category: { slug: string; name: string };
  question: { id: string; text: string } | null;
  createdAt: string;
  resolvedAt: string | null;
};

type ListResponse = Report[] & { page?: number; totalPages?: number; total?: number };

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "DISMISSED", label: "Dismissed" },
];

export default function AppReportsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track the reports you've submitted against questions.</p>
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
  const [page, setPage] = useState(1);

  const query = useQuery<ListResponse>({
    queryKey: ["app-reports", phone, status, page],
    queryFn: () => {
      const params = new URLSearchParams({ phone: encodeURIComponent(phone), page: String(page), limit: "10" });
      if (status) params.set("status", status);
      return apiFetch(`/api/public/reports?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  const data = query.data;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
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

      {query.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState
          icon={Flag}
          title="No reports"
          description={status ? `No ${status.toLowerCase().replace("_", " ")} reports.` : "Reports you submit will appear here."}
          actionLabel="Report a question"
          action={
            <Button asChild>
              <Link href="/app/report">Report a question</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {data.map((r) => (
            <div key={r.id} className="rounded-2xl border border-line bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      <ShieldAlert className="h-4 w-4 text-red-500" /> {r.reason.replace(/_/g, " ")}
                    </span>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {r.category.name} · Ticket <span className="font-mono">{r.ticket}</span> · {formatDate(r.createdAt)}
                  </p>
                  {r.question && <p className="mt-2 text-sm text-ink">"{r.question.text}"</p>}
                  {r.notes && <p className="mt-1 text-xs text-muted-foreground">{r.notes}</p>}
                  {r.screenshotUrl && (
                    <a href={r.screenshotUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand hover:underline">
                      View screenshot →
                    </a>
                  )}
                  {r.resolution && (
                    <p className="mt-2 rounded-lg bg-surface px-3 py-1.5 text-xs text-muted-foreground">
                      Resolution: {r.resolution}
                    </p>
                  )}
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