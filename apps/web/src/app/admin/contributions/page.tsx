"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Trash2, CheckCircle2, XCircle } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminToolbar } from "@/components/admin/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { formatDate, maskPhone } from "@/lib/utils";

type Contribution = {
  id: string;
  ticket: string;
  question: string;
  userPhone: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  aiScore: number | null;
  category: { name: string };
  duplicateOf: { text: string } | null;
  rejectionReason: string | null;
  createdAt: string;
};

const STATUS_BADGE: Record<Contribution["status"], "orange" | "green" | "red" | "purple"> = {
  PENDING: "orange",
  APPROVED: "green",
  REJECTED: "red",
  FLAGGED: "purple",
};

export default function AdminContributionsPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<Contribution | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const list = useAdminList<Contribution>({ path: "/api/admin/contributions" });

  const review = useMutation({
    mutationFn: ({ approved }: { approved: boolean }) =>
      apiFetch(`/api/admin/contributions/${reviewing?.id}/review`, {
        method: "PATCH",
        token,
        body: approved ? { status: "APPROVED" } : { status: "REJECTED", rejectionReason },
      }),
    onSuccess: () => {
      toast.success("Review saved");
      setReviewing(null);
      setRejectionReason("");
      qc.invalidateQueries({ queryKey: ["/api/admin/contributions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Review failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/contributions/${id}`, { method: "DELETE", token }),
    onSuccess: () => {
      toast.success("Contribution deleted");
      qc.invalidateQueries({ queryKey: ["/api/admin/contributions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const data = list.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Contributions</h1>
        <p className="text-sm text-muted-foreground">Community-submitted questions awaiting review</p>
      </div>

      <AdminToolbar
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search by question or ticket..."
        status={list.status}
        onStatusChange={list.setStatus}
        statusOptions={[
          { label: "All", value: "all" },
          { label: "Pending", value: "PENDING" },
          { label: "Approved", value: "APPROVED" },
          { label: "Rejected", value: "REJECTED" },
          { label: "Flagged", value: "FLAGGED" },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {list.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <EmptyState title="No contributions" description="Community submissions will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>From</TableHead>
                <TableHead>AI Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">{c.ticket}</span>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <p className="line-clamp-2 text-sm font-medium">{c.question}</p>
                    {c.duplicateOf && (
                      <p className="mt-1 text-xs text-amber-600">Duplicate of: {c.duplicateOf.text.slice(0, 60)}</p>
                    )}
                    {c.rejectionReason && <p className="mt-1 text-xs text-red-600">{c.rejectionReason}</p>}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{c.category.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{maskPhone(c.userPhone)}</span>
                  </TableCell>
                  <TableCell>{c.aiScore != null ? `${Math.round(c.aiScore * 100)}%` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[c.status]}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.status !== "APPROVED" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="Approve" onClick={() => review.mutate({ approved: true })}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                      {c.status !== "REJECTED" && c.status !== "FLAGGED" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600"
                          title="Reject"
                          onClick={() => { setReviewing(c); setRejectionReason(""); }}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        title="Delete"
                        onClick={() => { if (window.confirm("Delete this contribution?")) remove.mutate(c.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination page={list.page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} limit={20} onPageChange={list.setPage} className="mt-4" />

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Contribution</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-surface p-4">
              <p className="font-medium">"{reviewing?.question}"</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Category: {reviewing?.category.name} · Ticket: {reviewing?.ticket}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Rejection reason</Label>
              <Input
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Inappropriate content, duplicate"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={review.isPending}
              disabled={!reviewing}
              onClick={() => review.mutate({ approved: false })}
            >
              Reject Contribution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
