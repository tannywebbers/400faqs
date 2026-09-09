"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { listFaqs, createFaq, updateFaq, deleteFaq, type Faq } from "@/lib/admin/content";
import type { PaginatedResult } from "@/lib/admin/shared";
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
import { useDebounce } from "@/hooks/use-debounce";

const schema = z.object({
  question: z.string().min(5).max(300),
  answer: z.string().min(5).max(2000),
  order: z.coerce.number().min(0),
  status: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function AdminFaqsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 400);

  const query = useQuery<PaginatedResult<Faq>>({
    queryKey: ["admin-faqs", debounced],
    queryFn: () => listFaqs({ q: debounced }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { question: "", answer: "", order: 0, status: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ question: "", answer: "", order: 0, status: true });
    setDialogOpen(true);
  };

  const openEdit = (f: Faq) => {
    setEditing(f);
    form.reset({ question: f.question, answer: f.answer, order: f.order, status: f.status });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      editing
        ? updateFaq(editing.id, values)
        : createFaq(values),
    onSuccess: () => {
      toast.success(editing ? "FAQ updated" : "FAQ created");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-faqs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFaq(id),
    onSuccess: () => {
      toast.success("FAQ deleted");
      qc.invalidateQueries({ queryKey: ["admin-faqs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const data = query.data?.data ?? [];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FAQs</h1>
          <p className="text-sm text-muted-foreground">Frequently asked questions shown on the website</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New FAQ
        </Button>
      </div>

      <AdminToolbar search={q} onSearch={setQ} searchPlaceholder="Search FAQs..." status="" onStatusChange={() => {}} />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {query.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState title="No FAQs" description="Create your first FAQ." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Answer</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="text-xs text-muted-foreground">{f.order}</TableCell>
                  <TableCell className="max-w-xs">
                    <p className="font-medium">{f.question}</p>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <p className="line-clamp-2 text-sm text-muted-foreground">{f.answer}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.status ? "green" : "gray"}>{f.status ? "Active" : "Hidden"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        onClick={() => { if (window.confirm("Delete this FAQ?")) remove.mutate(f.id); }}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit FAQ" : "New FAQ"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label>Question</Label>
              <Input {...form.register("question")} placeholder="e.g. How do I start playing?" />
              {form.formState.errors.question && <p className="text-sm text-red-600">{form.formState.errors.question.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Answer</Label>
              <Textarea {...form.register("answer")} rows={4} />
              {form.formState.errors.answer && <p className="text-sm text-red-600">{form.formState.errors.answer.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Order</Label>
                <Input type="number" {...form.register("order")} />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.watch("status")}
                    onChange={(e) => form.setValue("status", e.target.checked)}
                    className="h-4 w-4 rounded border-line"
                  />
                  Active
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {editing ? "Save Changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
