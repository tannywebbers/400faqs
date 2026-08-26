"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MessageCircle, Webhook, Phone, Activity } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { AdminToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { maskPhone, timeAgo } from "@/lib/utils";

type WhatsAppStatus = { connected: boolean; qr: string | null; instance: string | null; messagesReceived: number; messagesSent: number };
type Session = { id: string; code: string; status: string; categoryName: string; hostPhone: string; playerCount: number; questionNumber: number; startedAt: string };

const SESSION_BADGE: Record<string, "green" | "orange" | "gray" | "blue" | "red"> = {
  WAITING: "orange",
  IN_PROGRESS: "green",
  COMPLETED: "blue",
  EXPIRED: "gray",
  ABANDONED: "red",
};

export default function AdminWhatsAppPage() {
  const token = getToken();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const statusQuery = useQuery<WhatsAppStatus>({
    queryKey: ["admin-whatsapp-status"],
    queryFn: () => apiFetch("/api/admin/whatsapp/status", { token }),
    refetchInterval: 30_000,
  });

  const sessions = useQuery<Session[]>({
    queryKey: ["admin-sessions", status, page],
    queryFn: () => apiFetch(`/api/admin/whatsapp/sessions?page=${page}&limit=20${status ? `&status=${status}` : ""}`, { token }),
    placeholderData: (prev) => prev,
  });

  const data = sessions.data as (Session[] & { totalPages?: number; total?: number }) | undefined;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">Connection status and live game sessions</p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${statusQuery.data?.connected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
              <MessageCircle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Connection</p>
              <p className="font-semibold">{statusQuery.data ? (statusQuery.data.connected ? "Connected" : "Disconnected") : "Checking..."}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Phone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Instance</p>
              <p className="font-semibold">{statusQuery.data?.instance ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Messages Received</p>
              <p className="font-semibold">{statusQuery.data?.messagesReceived?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Webhook className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Messages Sent</p>
              <p className="font-semibold">{statusQuery.data?.messagesSent?.toLocaleString() ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminToolbar
            search=""
            onSearch={() => {}}
            status={status}
            onStatusChange={(s) => { setStatus(s); setPage(1); }}
            statusOptions={[
              { label: "All", value: "all" },
              { label: "Waiting", value: "WAITING" },
              { label: "In Progress", value: "IN_PROGRESS" },
              { label: "Completed", value: "COMPLETED" },
              { label: "Expired", value: "EXPIRED" },
            ]}
          />
          {sessions.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : !(data ?? []).length ? (
            <EmptyState title="No sessions" description="Games will appear here as players start them." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-mono text-xs font-semibold">{s.code}</span>
                    </TableCell>
                    <TableCell>{s.categoryName}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{maskPhone(s.hostPhone)}</span>
                    </TableCell>
                    <TableCell>{s.playerCount}</TableCell>
                    <TableCell>{s.questionNumber}</TableCell>
                    <TableCell>
                      <Badge variant={SESSION_BADGE[s.status] ?? "gray"}>{s.status.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{timeAgo(s.startedAt)}</TableCell>
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
