"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Trash2, CheckCircle2, XCircle, ScanSearch } from "lucide-react";
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
import { formatDate, formatDateTime, maskPhone } from "@/lib/utils";

type SimilarityMatch = {
  questionId: string;
  text: string;
  type: string;
  similarity: number;
  reason: string;
};

type DuplicateInfo = {
  classification: string;
  confidence: number;
  score: number;
  reviewRequired: boolean;
  reviewReason: string | null;
  model: string | null;
  checkedAt: string;
  matches: SimilarityMatch[];
};

type AiResult = {
  moderation?: { score: number; reason: string | null; flagged?: boolean; ok?: boolean };
  duplicate?: DuplicateInfo;
};

type Contribution = {
  id: string;
  ticket: string;
  question: string;
  userPhone: string;
  type: "TRUTH" | "DARE" | "NORMAL";
  status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  aiScore: number | null;
  aiResult: AiResult | null;
  category: { name: string; slug: string };
  duplicateOf: { text: string } | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

const STATUS_BADGE: Record<Contribution["status"], "orange" | "green" | "red" | "purple"> = {
  PENDING: "orange",
  APPROVED: "green",
  REJECTED: "red",
  FLAGGED: "purple",
};

function aiVariant(c: Contribution): "red" | "orange" | "green" | "gray" {
  const cls = c.aiResult?.duplicate?.classification;
  if (!cls) return "gray";
  if (cls === "EXACT_DUPLICATE") return "red";
  if (cls === "VERY_SIMILAR") return "orange";
  return "green";
}

function aiLabel(c: Contribution): string {
  const d = c.aiResult?.duplicate;
  if (!d) return "Unchecked";
  if (d.reviewRequired) return `${d.classification} · review`;
  return d.classification;
}

export default function AdminContributionsPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<Contribution | null>(null);
  const [inspecting, setInspecting] = useState<Contribution | null>(null);
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
                <TableHead>AI</TableHead>
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
                    <p className="line-clamp-2 text-sm font-medium">
                      {c.type !== "NORMAL" && (
                        <Badge variant={c.type === "TRUTH" ? "purple" : "orange"} className="mr-1.5">
                          {c.type}
                        </Badge>
                      )}
                      {c.question}
                    </p>
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
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {c.aiScore != null && <span className="text-xs font-medium">{Math.round(c.aiScore * 100)}%</span>}
                      <Badge variant={aiVariant(c)} className="w-fit">
                        {aiLabel(c)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[c.status]}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Inspect" onClick={() => setInspecting(c)}>
                        <ScanSearch className="h-4 w-4" />
                      </Button>
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

      {/* Inspect dialog */}
      <Dialog open={!!inspecting} onOpenChange={(o) => !o && setInspecting(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Inspect contribution</DialogTitle>
          </DialogHeader>
          {inspecting && (
            <div className="space-y-5">
              <div className="rounded-xl bg-surface p-4">
                <p className="font-medium">"{inspecting.question}"</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant={inspecting.type === "TRUTH" ? "purple" : inspecting.type === "DARE" ? "orange" : "gray"}>{inspecting.type}</Badge>
                  <span>Category: {inspecting.category.name}</span>
                  <span>Ticket: {inspecting.ticket}</span>
                  <span>Phone: {maskPhone(inspecting.userPhone)}</span>
                  <span>{formatDateTime(inspecting.createdAt)}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={STATUS_BADGE[inspecting.status]}>{inspecting.status}</Badge>
                  {inspecting.rejectionReason && <span className="text-xs text-red-600">{inspecting.rejectionReason}</span>}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold">Content moderation</h3>
                {inspecting.aiResult?.moderation ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <Stat label="Score" value={`${Math.round(inspecting.aiResult.moderation.score * 100)}%`} />
                    <Stat label="Ok" value={inspecting.aiResult.moderation.ok ? "Yes" : "No"} />
                    <Stat label="Flagged" value={inspecting.aiResult.moderation.flagged ? "Yes" : "No"} />
                    <Stat label="Reason" value={inspecting.aiResult.moderation.reason ?? "—"} />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No moderation record.</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold">AI duplicate detection</h3>
                {inspecting.aiResult?.duplicate ? (() => {
                  const d = inspecting.aiResult!.duplicate!;
                  return (
                    <div className="mt-2 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                        <Stat label="Classification" value={d.classification} />
                        <Stat label="Confidence" value={`${Math.round(d.confidence * 100)}%`} />
                        <Stat label="Match score" value={`${Math.round(d.score * 100)}%`} />
                        <Stat label="Model" value={d.model ?? "local"} />
                      </div>
                      {d.reviewRequired && d.reviewReason && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{d.reviewReason}</p>
                      )}
                      {d.matches.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Matched questions ({d.matches.length})</p>
                          {d.matches.map((m) => (
                            <div key={m.questionId} className="rounded-lg border border-line p-3">
                              <p className="text-sm">{m.text}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <Badge variant={m.type === "TRUTH" ? "purple" : m.type === "DARE" ? "orange" : "gray"}>{m.type}</Badge>
                                <span>{Math.round(m.similarity * 100)}% similar</span>
                                {m.reason && <span className="italic">{m.reason}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No similar questions matched.</p>
                      )}
                    </div>
                  );
                })() : (
                  <p className="mt-2 text-xs text-muted-foreground">No duplicate check record.</p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Exact duplicates are rejected at approval automatically. Approving a contribution converts it into the category's question list.
              </p>

              <div className="flex flex-wrap justify-end gap-2">
                {inspecting.status !== "APPROVED" && (
                  <Button onClick={() => { setInspecting(null); review.mutate({ approved: true }); }}>
                    <CheckCircle2 className="h-4 w-4" /> Approve
                  </Button>
                )}
                {inspecting.status !== "REJECTED" && inspecting.status !== "FLAGGED" && (
                  <Button variant="destructive" onClick={() => { setInspecting(null); setReviewing(inspecting); setRejectionReason(""); }}>
                    <XCircle className="h-4 w-4" /> Reject
                  </Button>
                )}
                <Button variant="outline" onClick={() => setInspecting(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold text-ink">{value}</p>
    </div>
  );
}