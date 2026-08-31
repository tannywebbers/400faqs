"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { FolderPlus, CheckCircle2, XCircle } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminToolbar } from "@/components/admin/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { formatDate, maskPhone } from "@/lib/utils";

type Request = {
  id: string;
  name: string;
  description: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  phone: string;
  createdAt: string;
};

const STATUS_BADGE: Record<Request["status"], "orange" | "green" | "red"> = {
  PENDING: "orange",
  APPROVED: "green",
  REJECTED: "red",
};

export default function AdminCategoryRequestsPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<Request | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const list = useAdminList<Request>({ path: "/api/admin/category-requests" });

  const review = useMutation({
    mutationFn: ({ approved }: { approved: boolean }) =>
      apiFetch(`/api/admin/category-requests/${reviewing?.id}/review`, {
        method: "PATCH",
        token,
        body: approved ? { status: "APPROVED" } : { status: "REJECTED", rejectionReason },
      }),
    onSuccess: () => {
      toast.success("Request reviewed");
      setReviewing(null);
      setRejectionReason("");
      qc.invalidateQueries({ queryKey: ["/api/admin/category-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Review failed"),
  });

  const categories = useQuery<{ id: string; name: string }[]>({
    queryKey: ["admin-categories-simple"],
    queryFn: () => apiFetch("/api/admin/categories?limit=200", { token }),
  });

  const data = list.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Category Requests</h1>
        <p className="text-sm text-muted-foreground">Approve or reject user-requested categories</p>
      </div>

      <AdminToolbar
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search requests..."
        status={list.status}
        onStatusChange={list.setStatus}
        statusOptions={[
          { label: "All", value: "all" },
          { label: "Pending", value: "PENDING" },
          { label: "Approved", value: "APPROVED" },
          { label: "Rejected", value: "REJECTED" },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {list.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <EmptyState icon={FolderPlus} title="No requests" description="User category requests will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-semibold">{r.name}</p>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{maskPhone(r.phone)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {r.status === "PENDING" && (
                        <>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="Approve" onClick={() => review.mutate({ approved: true })}>
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600"
                            title="Reject"
                            onClick={() => { setReviewing(r); setRejectionReason(""); }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
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
            <DialogTitle>Reject Category Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-surface p-4">
              <p className="font-semibold">{reviewing?.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{reviewing?.description}</p>
            </div>
            <div className="space-y-2">
              <Label>Rejection reason</Label>
              <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Why is this being rejected?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={review.isPending} onClick={() => review.mutate({ approved: false })}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
