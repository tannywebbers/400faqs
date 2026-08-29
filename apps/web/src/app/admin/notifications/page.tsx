"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CheckCheck } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, timeAgo } from "@/lib/utils";

type AdminNotification = {
  id: string;
  type: string;
  channel: string;
  status: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  SYSTEM_ALERT: "System",
  ADMIN_ALERT: "Alert",
  SYSTEM: "System",
  REPORT: "Report",
  CATEGORY_REQ: "Category request",
  CONTRIBUTION: "Contribution",
};

export default function AdminNotificationsPage() {
  const token = getToken();
  const qc = useQueryClient();

  const query = useQuery<AdminNotification[]>({
    queryKey: ["admin-notifications"],
    queryFn: () => apiFetch("/api/admin/notifications", { token }),
    refetchInterval: 60_000,
  });

  const unread = useQuery<{ count: number }>({
    queryKey: ["admin-notifications-unread"],
    queryFn: () => apiFetch("/api/admin/notifications/unread-count", { token }),
    refetchInterval: 30_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/notifications/${id}/read`, { method: "POST", token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-notifications-unread"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/api/admin/notifications/read-all", { method: "POST", token }),
    onSuccess: () => {
      toast.success("All marked as read");
      qc.invalidateQueries({ queryKey: ["admin-notifications-unread"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const data = query.data ?? [];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            System and moderation alerts
            {unread.data && unread.data.count > 0 ? ` · ${unread.data.count} unread` : ""}
          </p>
        </div>
        <Button variant="outline" loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl">
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : data.length === 0 ? (
            <EmptyState title="No notifications" description="System alerts will appear here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((n) => (
                  <TableRow key={n.id} className={n.readAt ? "" : "bg-brand/[0.03]"}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />}
                        <p className="font-medium">{n.title}</p>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="line-clamp-2 text-sm text-muted-foreground">{n.message}</p>
                      {n.link && <p className="mt-0.5 text-xs text-brand">{n.link}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={n.type === "SYSTEM_ALERT" ? "orange" : n.type === "REPORT" ? "red" : "gray"}>
                        {TYPE_LABELS[n.type] ?? n.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={n.readAt ? "gray" : "green"}>{n.readAt ? "Read" : "New"}</Badge>
                        {!n.readAt && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" loading={markRead.isPending} onClick={() => markRead.mutate(n.id)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <p>{timeAgo(n.createdAt)}</p>
                      <p className="text-muted-foreground/70">{formatDateTime(n.createdAt)}</p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}