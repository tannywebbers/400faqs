"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Eye, PlayCircle } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminToolbar } from "@/components/admin/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { formatDate, maskPhone } from "@/lib/utils";

type Session = {
  id: string;
  status: "WAITING" | "ACTIVE" | "COMPLETED" | "ABANDONED";
  state: string;
  round: number;
  turnsPlayed: number;
  createdAt: string;
  lastActivityAt: string;
  creator: { phone: string; name: string | null };
  joiner: { phone: string; name: string | null } | null;
  category: { name: string; slug: string } | null;
  _count: { moves: number };
};

type SessionDetail = Session & {
  winner: { name: string } | null;
  moves: {
    id: string;
    round: number;
    number: number | null;
    type: string;
    status: string;
    answer: string | null;
    createdAt: string;
    answeredAt: string | null;
    question: { text: string; type: string };
    askedByUser: { phone: string };
    answeredByUser: { phone: string };
  }[];
};

const STATUS_BADGE: Record<Session["status"], "green" | "orange" | "gray" | "red"> = {
  WAITING: "orange",
  ACTIVE: "green",
  COMPLETED: "gray",
  ABANDONED: "red",
};

export default function AdminSessionsPage() {
  const token = getToken();
  const [viewing, setViewing] = useState<Session | null>(null);

  const list = useAdminList<Session>({ path: "/api/admin/sessions", limit: 20 });

  const detail = useQuery<SessionDetail>({
    queryKey: ["admin-session", viewing?.id],
    queryFn: () => apiFetch(`/api/admin/sessions/${viewing?.id}`, { token }),
    enabled: !!viewing,
  });

  const data = list.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
        <p className="text-sm text-muted-foreground">Monitor active and past game sessions</p>
      </div>

      <AdminToolbar
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search sessions..."
        status={list.status}
        onStatusChange={list.setStatus}
        statusOptions={[
          { label: "All", value: "all" },
          { label: "Waiting", value: "WAITING" },
          { label: "Active", value: "ACTIVE" },
          { label: "Completed", value: "COMPLETED" },
          { label: "Abandoned", value: "ABANDONED" },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {list.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <EmptyState icon={PlayCircle} title="No sessions" description="Game sessions will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Players</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Round</TableHead>
                <TableHead>Moves</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{s.creator.name ?? maskPhone(s.creator.phone)}</p>
                    {s.joiner && (
                      <p className="text-xs text-muted-foreground">vs {s.joiner.name ?? maskPhone(s.joiner.phone)}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">{s.category?.name ?? "—"}</span>
                  </TableCell>
                  <TableCell>{s.round}</TableCell>
                  <TableCell>{s._count.moves}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[s.status]}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setViewing(s)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination page={list.page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} limit={20} onPageChange={list.setPage} className="mt-4" />

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Session Details</DialogTitle>
          </DialogHeader>
          {detail.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-xl" />
              ))}
            </div>
          ) : detail.data && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={STATUS_BADGE[detail.data.status]} className="mt-1">{detail.data.status}</Badge>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="mt-1 font-medium">{detail.data.category?.name ?? "—"}</p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">Creator</p>
                  <p className="mt-1 font-medium">{detail.data.creator.name ?? maskPhone(detail.data.creator.phone)}</p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">Joiner</p>
                  <p className="mt-1 font-medium">{detail.data.joiner ? (detail.data.joiner.name ?? maskPhone(detail.data.joiner.phone)) : "—"}</p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">Round</p>
                  <p className="mt-1 font-medium">{detail.data.round}</p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted-foreground">Winner</p>
                  <p className="mt-1 font-medium">{detail.data.winner?.name ?? "—"}</p>
                </div>
              </div>
              {detail.data.moves.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold">Moves</p>
                  <div className="max-h-60 space-y-2 overflow-y-auto">
                    {detail.data.moves.map((m) => (
                      <div key={m.id} className="rounded-xl border border-line p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Round {m.round} · #{m.number ?? "?"}</span>
                          <Badge variant="gray">{m.type}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">Q: {m.question.text}</p>
                        {m.answer && <p className="mt-1 text-primary-700">A: {m.answer}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
