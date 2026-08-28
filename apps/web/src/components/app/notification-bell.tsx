"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePhone } from "@/hooks/use-phone";
import { apiFetch } from "@/lib/api";

export function NotificationBell() {
  const { phone } = usePhone();
  const enabled = Boolean(phone);

  const unread = useQuery<{ count: number }>({
    queryKey: ["player-notifications-unread", phone],
    queryFn: () => apiFetch(`/api/public/notifications/unread-count?phone=${encodeURIComponent(phone as string)}`),
    enabled,
    refetchInterval: 60_000,
  });

  const count = unread.data?.count ?? 0;

  return (
    <Link
      href="/app/notifications"
      aria-label={`Notifications${count > 0 ? `, ${count} unread` : ""}`}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface hover:text-ink"
    >
      <Bell className="h-5 w-5" />
      {enabled && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}