"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
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
import { formatDate } from "@/lib/utils";

type Ad = {
  id: string;
  name: string;
  content: string;
  mediaUrl: string | null;
  linkUrl: string | null;
  audience: "ALL" | "NEW_USERS" | "ACTIVE" | "INACTIVE";
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  startsAt: string | null;
  endsAt: string | null;
  impressionCount: number;
  createdAt: string;
};

const schema = z.object({
  name: z.string().min(3).max(100),
  content: z.string().min(3).max(2000),
  mediaUrl: z.string().url().optional().or(z.literal("")),
  linkUrl: z.string().url().optional().or(z.literal("")),
  audience: z.enum(["ALL", "NEW_USERS", "ACTIVE", "INACTIVE"]),
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function AdminAdsPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery<Ad[]>({
    queryKey: ["admin-ads", status, page],
    queryFn: () => apiFetch(`/api/admin/ads?page=${page}&limit=20${status ? `&status=${status}` : ""}`, { token }),
    placeholderData: (prev) => prev,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", content: "", mediaUrl: "", linkUrl: "", audience: "ALL", status: "ACTIVE", startsAt: "", endsAt: "" },
  });

  const openCreate = () => {
    setEditing(null);
    form.reset({ name: "", content: "", mediaUrl: "", linkUrl: "", audience: "ALL", status: "ACTIVE", startsAt: "", endsAt: "" });
    setDialogOpen(true);
  };

  const openEdit = (ad: Ad) => {
    setEditing(ad);
    form.reset({
      name: ad.name,
      content: ad.content,
      mediaUrl: ad.mediaUrl ?? "",
      linkUrl: ad.linkUrl ?? "",
      audience: ad.audience,
      status: ad.status,
      startsAt: ad.startsAt ? ad.startsAt.slice(0, 10) : "",
      endsAt: ad.endsAt ? ad.endsAt.slice(0, 10) : "",
    });
    setDialogOpen(true);
  };

  const save = useMutation({
    mutationFn: (values: FormValues) =>
      editing
        ? apiFetch(`/api/admin/ads/${editing.id}`, { method: "PUT", token, body: values })
        : apiFetch("/api/admin/ads", { method: "POST", token, body: values }),
    onSuccess: () => {
      toast.success(editing ? "Ad updated" : "Ad created");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-ads"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/ads/${id}`, { method: "DELETE", token }),
    onSuccess: () => {
      toast.success("Ad deleted");
      qc.invalidateQueries({ queryKey: ["admin-ads"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const data = query.data as (Ad[] & { totalPages?: number; total?: number }) | undefined;
  const ads = data ?? [];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ads</h1>
          <p className="text-sm text-muted-foreground">Manage promotional messages and campaigns</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Ad
        </Button>
      </div>

      <AdminToolbar
        search=""
        onSearch={() => {}}
        status={status}
        onStatusChange={(s) => { setStatus(s); setPage(1); }}
        statusOptions={[
          { label: "All", value: "all" },
          { label: "Active", value: "ACTIVE" },
          { label: "Paused", value: "PAUSED" },
          { label: "Completed", value: "COMPLETED" },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {query.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : ads.length === 0 ? (
          <EmptyState title="No ads" description="Create your first campaign." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Impressions</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ads.map((ad) => (
                <TableRow key={ad.id}>
                  <TableCell>
                    <p className="font-medium">{ad.name}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{ad.content}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="gray">{ad.audience.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>{ad.impressionCount.toLocaleString()}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {ad.startsAt ? formatDate(ad.startsAt) : "—"} → {ad.endsAt ? formatDate(ad.endsAt) : "∞"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ad.status === "ACTIVE" ? "green" : ad.status === "PAUSED" ? "orange" : "gray"}>{ad.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Copy content" onClick={() => { navigator.clipboard.writeText(ad.content); toast.success("Copied"); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ad)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        onClick={() => { if (window.confirm("Delete this ad?")) remove.mutate(ad.id); }}
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
            <DialogTitle>{editing ? "Edit Ad" : "New Ad"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...form.register("name")} placeholder="e.g. Summer Promo" />
              {form.formState.errors.name && <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <Textarea {...form.register("content")} rows={3} />
              {form.formState.errors.content && <p className="text-sm text-red-600">{form.formState.errors.content.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Media URL</Label>
                <Input {...form.register("mediaUrl")} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Link URL</Label>
                <Input {...form.register("linkUrl")} placeholder="https://..." />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select value={form.watch("audience")} onValueChange={(v) => form.setValue("audience", v as FormValues["audience"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Users</SelectItem>
                    <SelectItem value="NEW_USERS">New Users</SelectItem>
                    <SelectItem value="ACTIVE">Active Users</SelectItem>
                    <SelectItem value="INACTIVE">Inactive Users</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v as FormValues["status"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="PAUSED">Paused</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" {...form.register("startsAt")} />
              </div>
              <div className="space-y-2">
                <Label>End date</Label>
                <Input type="date" {...form.register("endsAt")} />
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
