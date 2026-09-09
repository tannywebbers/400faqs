"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { listQuestions, createQuestion, reviewQuestion, deleteQuestion, type Question } from "@/lib/admin/questions";
import { listAllCategoriesSimple } from "@/lib/admin/categories";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminToolbar } from "@/components/admin/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { formatDate } from "@/lib/utils";

const STATUS_BADGE: Record<Question["status"], "orange" | "green" | "red"> = {
  PENDING: "orange",
  APPROVED: "green",
  REJECTED: "red",
};

export default function AdminQuestionsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewing, setReviewing] = useState<Question | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const list = useAdminList<Question>({ queryKey: "admin-questions", queryFn: (p) => listQuestions(p), limit: 20 });

  const categories = useQuery<{ id: string; name: string }[]>({
    queryKey: ["admin-categories-simple"],
    queryFn: () => listAllCategoriesSimple(),
  });

  const [form, setForm] = useState({ text: "", type: "NORMAL" as Question["type"], categoryId: "" });

  const create = useMutation({
    mutationFn: () => createQuestion(form),
    onSuccess: () => {
      toast.success("Question created");
      setCreateOpen(false);
      setForm({ text: "", type: "NORMAL", categoryId: "" });
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  const review = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      approved ? reviewQuestion(id, "APPROVED") : reviewQuestion(id, "REJECTED", rejectionReason),
    onSuccess: () => {
      toast.success("Review saved");
      setReviewing(null);
      setRejectionReason("");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Review failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteQuestion(id),
    onSuccess: () => {
      toast.success("Question deleted");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const data = list.data;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Questions</h1>
          <p className="text-sm text-muted-foreground">Review and manage the question library</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Add Question
        </Button>
      </div>

      <AdminToolbar
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search questions..."
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
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <EmptyState title="No questions" description="Add a question or wait for community contributions." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Plays</TableHead>
                <TableHead>Reports</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="max-w-xs">
                    <p className="line-clamp-2 font-medium">{q.text}</p>
                    {q.rejectionReason && <p className="mt-1 text-xs text-red-600">{q.rejectionReason}</p>}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{q.category.name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={q.type === "TRUTH" ? "purple" : q.type === "DARE" ? "orange" : "gray"}>
                      {q.type === "NORMAL" ? "Question" : q.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={q.source === "COMMUNITY" ? "blue" : "gray"}>{q.source}</Badge>
                  </TableCell>
                  <TableCell>{q.playsCount.toLocaleString()}</TableCell>
                  <TableCell>
                    {q.reportCount > 0 ? <Badge variant="red">{q.reportCount}</Badge> : "0"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[q.status]}>{q.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(q.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {q.status !== "APPROVED" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="Approve" onClick={() => review.mutate({ id: q.id, approved: true })}>
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                      {q.status !== "REJECTED" && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Reject" onClick={() => { setReviewing(q); setRejectionReason(""); }}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        title="Delete"
                        onClick={() => { if (window.confirm("Delete this question?")) remove.mutate(q.id); }}
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Question text</Label>
              <Textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={3} placeholder="e.g. What's the most embarrassing thing you've done?" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Question["type"] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">Question</SelectItem>
                    <SelectItem value="TRUTH">Truth</SelectItem>
                    <SelectItem value="DARE">Dare</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {(categories.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={create.isPending} disabled={!form.text || !form.categoryId} onClick={() => create.mutate()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-surface p-4">
              <p className="font-medium">"{reviewing?.text}"</p>
              <p className="mt-1 text-xs text-muted-foreground">Category: {reviewing?.category.name} · Type: {reviewing?.type}</p>
            </div>
            <div className="space-y-2">
              <Label>Rejection reason</Label>
              <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="e.g. Duplicate, inappropriate content" />
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
              onClick={() => reviewing && review.mutate({ id: reviewing.id, approved: false })}
            >
              Reject Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
