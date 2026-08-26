"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Send } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/utils";

type Notification = { id: string; title: string; body: string; target: string; status: string; deliveredCount: number; createdAt: string };

export default function AdminNotificationsPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", target: "ALL" });

  const query = useQuery<Notification[]>({
    queryKey: ["admin-notifications"],
    queryFn: () => apiFetch("/api/admin/notifications", { token }),
    refetchInterval: 60_000,
  });

  const unread = useQuery<{ count: number }>({
    queryKey: ["admin-notifications-unread"],
    queryFn: () => apiFetch("/api/admin/notifications/unread-count", { token }),
    refetchInterval: 60_000,
  });

  const create = useMutation({
    mutationFn: () => apiFetch("/api/admin/notifications", { method: "POST", token, body: form }),
    onSuccess: () => {
      toast.success("Notification queued");
      setCreateOpen(false);
      setForm({ title: "", body: "", target: "ALL" });
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/api/admin/notifications/mark-all-read", { method: "POST", token }),
    onSuccess: () => {
      toast.success("All marked as read");
      qc.invalidateQueries({ queryKey: ["admin-notifications-unread"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const data = query.data ?? [];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Broadcast messages to players{unread.data?.count ? ` · ${unread.data.count} unread admin alerts` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => markAllRead.mutate()}>
            Mark all read
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Send Broadcast
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {query.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <EmptyState title="No notifications" description="Broadcasts you send will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Body</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((n) => (
                <TableRow key={n.id}>
                  <TableCell>
                    <p className="font-medium">{n.title}</p>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <p className="line-clamp-1 text-sm text-muted-foreground">{n.body}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="gray">{n.target.replace("_", " ")}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={n.status === "SENT" ? "green" : n.status === "SENDING" ? "orange" : "gray"}>{n.status}</Badge>
                  </TableCell>
                  <TableCell>{n.deliveredCount.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(n.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Broadcast</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. New category added!" />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select value={form.target} onValueChange={(v) => setForm({ ...form, target: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Users</SelectItem>
                  <SelectItem value="ACTIVE">Active Users</SelectItem>
                  <SelectItem value="INACTIVE">Inactive Users</SelectItem>
                  <SelectItem value="PREMIUM">Premium Users</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button loading={create.isPending} disabled={!form.title || !form.body} onClick={() => create.mutate()}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
