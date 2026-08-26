"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
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

type Badge = { id: string; name: string; description: string; icon: string; color: string; threshold: number; awardedCount: number };

const schema = z.object({
  name: z.string().min(2).max(60),
  description: z.string().min(5).max(300),
  icon: z.string().min(1).max(10),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  threshold: z.coerce.number().min(0),
});

type FormValues = z.infer<typeof schema>;

export default function AdminBadgesPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Badge | null>(null);
  const [q, setQ] = useState("");

  const query = useQuery<Badge[]>({
    queryKey: ["admin-badges", q],
    queryFn: () => apiFetch(`/api/admin/badges${q ? `?q=${encodeURIComponent(q)}` : ""}`, { token }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", icon: "🏅", color: "#6366f1", threshold: 1 },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", description: "", icon: "🏅", color: "#6366f1", threshold: 1 });
    setDialogOpen(true);
  };

  const openEdit = (b: Badge) => {
    setEditing(b);
    form.reset({ name: b.name, description: b.description, icon: b.icon, color: b.color, threshold: b.threshold });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      editing
        ? apiFetch(`/api/admin/badges/${editing.id}`, { method: "PUT", token, body: values })
        : apiFetch("/api/admin/badges", { method: "POST", token, body: values }),
    onSuccess: () => {
      toast.success(editing ? "Badge updated" : "Badge created");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-badges"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/badges/${id}`, { method: "DELETE", token }),
    onSuccess: () => {
      toast.success("Badge deleted");
      qc.invalidateQueries({ queryKey: ["admin-badges"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const data = query.data ?? [];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Badges</h1>
          <p className="text-sm text-muted-foreground">Achievements awarded to contributors and players</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Badge
        </Button>
      </div>

      <AdminToolbar search={q} onSearch={setQ} searchPlaceholder="Search badges..." status="" onStatusChange={() => {}} />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {query.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState title="No badges" description="Create badges to reward your community." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Badge</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Awarded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: b.color + "1a" }}>
                        {b.icon}
                      </span>
                      <p className="font-semibold">{b.name}</p>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <p className="line-clamp-1 text-sm text-muted-foreground">{b.description}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="gray">{b.threshold}</Badge>
                  </TableCell>
                  <TableCell>{b.awardedCount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        onClick={() => { if (window.confirm("Delete this badge?")) remove.mutate(b.id); }}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Badge" : "New Badge"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...form.register("name")} placeholder="e.g. Question Machine" />
              {form.formState.errors.name && <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea {...form.register("description")} rows={2} />
              {form.formState.errors.description && <p className="text-sm text-red-600">{form.formState.errors.description.message}</p>}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Input {...form.register("icon")} className="text-center" />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input type="color" {...form.register("color")} className="h-10 p-1" />
              </div>
              <div className="space-y-2">
                <Label>Threshold</Label>
                <Input type="number" {...form.register("threshold")} />
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
