"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCheck, Check, BellRing } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PhoneGate } from "@/components/app/phone-gate";
import { usePhone } from "@/hooks/use-phone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { cn, timeAgo } from "@/lib/utils";

type PlayerNotification = {
  id: string;
  type: string;
  channel: "WEB" | "WHATSAPP";
  status: string;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

function NotificationsInner() {
  const { phone } = usePhone();
  const qc = useQueryClient();

  const enabled = Boolean(phone);
  const list = useQuery<PlayerNotification[]>({
    queryKey: ["player-notifications", phone],
    queryFn: () => apiFetch(`/api/public/notifications?phone=${encodeURIComponent(phone as string)}`),
    enabled,
  });

  const unread = useQuery<{ count: number }>({
    queryKey: ["player-notifications-unread", phone],
    queryFn: () => apiFetch(`/api/public/notifications/unread-count?phone=${encodeURIComponent(phone as string)}`),
    enabled,
    refetchInterval: 60_000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["player-notifications", phone] });
    qc.invalidateQueries({ queryKey: ["player-notifications-unread", phone] });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/public/notifications/${id}/read`, { method: "POST", body: { phone } }),
    onSuccess: refresh,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiFetch("/api/public/notifications/read-all", { method: "POST", body: { phone } }),
    onSuccess: () => {
      toast.success("All notifications marked as read");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const unreadCount = unread.data?.count ?? 0;
  const items = list.data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            <BellRing className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" loading={markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {list.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="Game updates, verification results and system messages will show up here."
        />
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <Card key={n.id} className={cn("transition-colors", n.read ? "bg-surface" : "border-brand/30")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {!n.read && <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />}
                    <Badge variant={n.channel === "WHATSAPP" ? "blue" : "gray"}>{n.channel}</Badge>
                    <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </div>
                  {!n.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-xs"
                      loading={markRead.isPending}
                      onClick={() => markRead.mutate(n.id)}
                    >
                      <Check className="h-3.5 w-3.5" /> Mark read
                    </Button>
                  )}
                </div>
                <p className="mt-2 font-semibold">{n.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PhoneGate>
        <NotificationsInner />
      </PhoneGate>
    </div>
  );
}