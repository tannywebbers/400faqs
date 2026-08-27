"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Layers } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePhone } from "@/hooks/use-phone";
import { PhoneGate } from "@/components/app/phone-gate";
import { StatusPill } from "@/components/app/status-pill";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate } from "@/lib/utils";

type RequestRow = {
  id: string;
  name: string;
  description: string;
  examples: string | null;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = RequestRow[] & { page?: number; totalPages?: number; total?: number };

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

export default function AppRequestsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My Category Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track the categories you've suggested to the community.</p>
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
    queryKey: ["app-requests", phone, status, page],
    queryFn: () => {
      const params = new URLSearchParams({ phone: encodeURIComponent(phone), page: String(page), limit: "10" });
      if (status) params.set("status", status);
      return apiFetch(`/api/public/category-requests?${params.toString()}`);
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
          icon={Layers}
          title="No requests"
          description="Categories you request will appear here."
          actionLabel="Request a category"
          action={
            <Button asChild>
              <Link href="/app/request-category">Request a category</Link>
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
                    <h3 className="font-semibold">{r.name}</h3>
                    <StatusPill status={r.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">Requested {formatDate(r.createdAt)}</p>
                  {r.note && (
                    <p className="mt-2 rounded-lg bg-surface px-3 py-1.5 text-xs text-muted-foreground">
                      Moderation note: {r.note}
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