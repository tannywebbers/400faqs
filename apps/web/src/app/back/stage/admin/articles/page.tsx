"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { listArticles, createArticle, updateArticle, deleteArticle, type Article } from "@/lib/admin/content";
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
  title: z.string().min(5).max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  excerpt: z.string().min(10).max(300),
  category: z.string().min(2).max(100),
  content: z.string().min(50),
  status: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function AdminArticlesPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 400);

  const query = useQuery<PaginatedResult<Article>>({
    queryKey: ["admin-articles", debounced],
    queryFn: () => listArticles({ q: debounced }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", slug: "", excerpt: "", category: "Getting Started", content: "", status: true },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ title: "", slug: "", excerpt: "", category: "Getting Started", content: "", status: true });
    setDialogOpen(true);
  };

  const openEdit = (a: Article) => {
    setEditing(a);
    form.reset({ title: a.title, slug: a.slug, excerpt: a.excerpt, category: a.category, content: "", status: a.status });
  };

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      editing
        ? updateArticle(editing.id, values)
        : createArticle(values),
    onSuccess: () => {
      toast.success(editing ? "Article updated" : "Article created");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-articles"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteArticle(id),
    onSuccess: () => {
      toast.success("Article deleted");
      qc.invalidateQueries({ queryKey: ["admin-articles"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const data = query.data?.data ?? [];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Help Articles</h1>
          <p className="text-sm text-muted-foreground">Articles shown in the Help Center</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Article
        </Button>
      </div>

      <AdminToolbar search={q} onSearch={setQ} searchPlaceholder="Search articles..." status="" onStatusChange={() => {}} />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {query.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState title="No articles" description="Create your first help article." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.title}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{a.excerpt}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="gray">{a.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">/{a.slug}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.status ? "green" : "gray"}>{a.status ? "Published" : "Draft"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <a href={`/help/${a.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        onClick={() => { if (window.confirm("Delete this article?")) remove.mutate(a.id); }}
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Article" : "New Article"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input {...form.register("title")} />
                {form.formState.errors.title && <p className="text-sm text-red-600">{form.formState.errors.title.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input {...form.register("slug")} placeholder="getting-started" />
                {form.formState.errors.slug && <p className="text-sm text-red-600">{form.formState.errors.slug.message}</p>}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Excerpt</Label>
              <Input {...form.register("excerpt")} />
              {form.formState.errors.excerpt && <p className="text-sm text-red-600">{form.formState.errors.excerpt.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input {...form.register("category")} />
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea {...form.register("content")} rows={10} placeholder="Write the article content here. Paragraphs separated by blank lines." />
              {form.formState.errors.content && <p className="text-sm text-red-600">{form.formState.errors.content.message}</p>}
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={form.watch("status")}
                  onChange={(e) => form.setValue("status", e.target.checked)}
                  className="h-4 w-4 rounded border-line"
                />
                Published
              </label>
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
