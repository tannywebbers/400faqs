"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { ShieldAlert, Eye } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminToolbar } from "@/components/admin/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { formatDate, maskPhone } from "@/lib/utils";

type Report = {
  id: string;
  ticket: string;
  reason: string;
  notes: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  reporterPhone: string;
  screenshotUrl: string | null;
  category: { name: string };
  question: { text: string } | null;
  resolution: string | null;
  createdAt: string;
};

const STATUS_BADGE: Record<Report["status"], "red" | "orange" | "green" | "gray"> = {
  OPEN: "red",
  IN_PROGRESS: "orange",
  RESOLVED: "green",
  DISMISSED: "gray",
};

export default function AdminReportsPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<Report | null>(null);
  const [resolution, setResolution] = useState("");

  const list = useAdminList<Report>({ path: "/api/admin/reports" });

  const update = useMutation({
    mutationFn: (status: Report["status"]) =>
      apiFetch(`/api/admin/reports/${viewing?.id}`, { method: "PATCH", token, body: { status, resolution } }),
    onSuccess: () => {
      toast.success("Report updated");
      setViewing(null);
      setResolution("");
      qc.invalidateQueries({ queryKey: ["/api/admin/reports"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const data = list.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Community reports for question quality control</p>
      </div>

      <AdminToolbar
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search reports..."
        status={list.status}
        onStatusChange={list.setStatus}
        statusOptions={[
          { label: "All", value: "all" },
          { label: "Open", value: "OPEN" },
          { label: "In Progress", value: "IN_PROGRESS" },
          { label: "Resolved", value: "RESOLVED" },
          { label: "Dismissed", value: "DISMISSED" },
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
          <EmptyState icon={ShieldAlert} title="No reports" description="You're all caught up." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Question / Category</TableHead>
                <TableHead>Reported By</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">{r.ticket}</span>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{r.reason}</p>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="line-clamp-1 text-sm">{r.question?.text ?? r.category.name}</p>
                    <p className="text-xs text-muted-foreground">in {r.category.name}</p>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{maskPhone(r.reporterPhone)}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[r.status]}>{r.status.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="View"
                      onClick={() => {
                        setViewing(r);
                        setResolution(r.resolution ?? "");
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination page={list.page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} limit={20} onPageChange={list.setPage} className="mt-4" />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report {viewing?.ticket}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <div className="rounded-xl bg-surface p-4">
                <p className="text-sm font-semibold">Reason: {viewing.reason}</p>
                {viewing.notes && <p className="mt-1 text-sm text-muted-foreground">Notes: {viewing.notes}</p>}
                {viewing.question && (
                  <p className="mt-2 border-t border-line pt-2 text-sm">Question: "{viewing.question.text}"</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">Category: {viewing.category.name}</p>
                {viewing.screenshotUrl && (
                  <a href={viewing.screenshotUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand hover:underline">
                    View screenshot
                  </a>
                )}
              </div>
              <div className="space-y-2">
                <Label>Resolution notes</Label>
                <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} placeholder="How was this resolved?" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={viewing.status} onValueChange={(v) => update.mutate(v as Report["status"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                    <SelectItem value="DISMISSED">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
            <Button loading={update.isPending} onClick={() => update.mutate("RESOLVED")}>
              Mark Resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
