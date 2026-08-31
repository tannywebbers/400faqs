"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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

type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  rules: string | null;
  icon: string;
  color: string;
  status: "ACTIVE" | "ARCHIVED";
  trending: boolean;
  questionCount: number;
  playCount: number;
};

const schema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().min(5).max(1000),
  rules: z.string().max(2000).optional(),
  icon: z.string().min(1).max(10),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  trending: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const ICONS = ["✨", "🔥", "🎬", "🎮", "❤️", "😆", "🌍", "⚽", "🎵", "🍕", "💼", "📚", "🧠", "🤔", "🃏", "🎯", "💘", "👻"];
const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6"];

export default function AdminCategoriesPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const list = useAdminList<Category>({ path: "/api/admin/categories" });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { icon: "✨", color: "#6366f1", status: "ACTIVE", trending: false },
  });

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["admin-categories-all"],
    queryFn: () => apiFetch("/api/admin/categories?limit=100", { token }),
    enabled: false,
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", description: "", rules: "", icon: "✨", color: "#6366f1", status: "ACTIVE", trending: false });
    setDialogOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    form.reset({
      name: c.name,
      description: c.description,
      rules: c.rules ?? "",
      icon: c.icon,
      color: c.color,
      status: c.status,
      trending: c.trending,
    });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      editing
        ? apiFetch(`/api/admin/categories/${editing.id}`, { method: "PUT", token, body: values })
        : apiFetch("/api/admin/categories", { method: "POST", token, body: values }),
    onSuccess: () => {
      toast.success(editing ? "Category updated" : "Category created");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/admin/categories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/categories/${id}`, { method: "DELETE", token }),
    onSuccess: () => {
      toast.success("Category deleted");
      qc.invalidateQueries({ queryKey: ["/api/admin/categories"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const data = list.data;

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">Manage question categories</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Category
        </Button>
      </div>

      <AdminToolbar
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search categories..."
        status={list.status}
        onStatusChange={list.setStatus}
        statusOptions={[
          { label: "All", value: "all" },
          { label: "Active", value: "ACTIVE" },
          { label: "Archived", value: "ARCHIVED" },
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
          <EmptyState title="No categories" description="Create your first category to get started." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Questions</TableHead>
                <TableHead>Plays</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trending</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: c.color + "1a" }}>
                        {c.icon}
                      </span>
                      <div>
                        <p className="font-semibold">{c.name}</p>
                        <p className="text-xs text-muted-foreground">/{c.slug}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{c.questionCount.toLocaleString()}</TableCell>
                  <TableCell>{c.playCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "ACTIVE" ? "green" : "gray"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell>{c.trending ? <Badge variant="orange">Trending</Badge> : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        onClick={() => {
                          if (window.confirm(`Delete category "${c.name}"?`)) remove.mutate(c.id);
                        }}
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

      <Pagination
        page={list.page}
        totalPages={data?.totalPages ?? 1}
        total={data?.total ?? 0}
        limit={20}
        onPageChange={list.setPage}
        className="mt-4"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...form.register("name")} placeholder="e.g. Pop Culture" />
              {form.formState.errors.name && <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea {...form.register("description")} rows={3} placeholder="What kind of questions live here?" />
              {form.formState.errors.description && <p className="text-sm text-red-600">{form.formState.errors.description.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Rules (optional)</Label>
              <Textarea {...form.register("rules")} rows={2} placeholder="Special rules for this category" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ICONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => form.setValue("icon", icon)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors ${
                        form.watch("icon") === icon ? "bg-brand/20 ring-2 ring-brand" : "bg-surface hover:bg-brand/10"
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-1.5">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => form.setValue("color", color)}
                      className={`h-8 w-8 rounded-lg transition-transform ${form.watch("color") === color ? "scale-110 ring-2 ring-offset-2 ring-brand" : "hover:scale-105"}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <select {...form.register("status")} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm">
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={form.watch("trending")}
                    onChange={(e) => form.setValue("trending", e.target.checked)}
                    className="h-4 w-4 rounded border-line"
                  />
                  Trending
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
