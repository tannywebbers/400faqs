"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { cn, timeAgo } from "@/lib/utils";

type QueueCounts = { waiting: number; active: number; completed: number; failed: number; delayed: number; paused: number };

type RecentJob = { id: string; name: string; queue: string; status: string; attempts: number; timestamp: number | null; error?: string; data?: unknown };

type JobsData = { queues: Record<string, QueueCounts>; recent: RecentJob[]; queue: string; states: string[]; page: number };

const QUEUE_LIST = ["moderation", "game", "notification", "campaign", "snapshot"];
const STATES = ["failed", "active", "waiting", "completed", "delayed"] as const;

export default function AdminJobsPage() {
  const token = getToken();
  const [queue, setQueue] = useState("notification");
  const [state, setState] = useState<(typeof STATES)[number]>("failed");

  const query = useQuery<JobsData>({
    queryKey: ["admin-jobs", queue, state],
    queryFn: () => apiFetch(`/api/admin/jobs?queue=${queue}&state=${state}`, { token }),
    refetchInterval: 30_000,
  });

  const retry = useMutation({
    mutationFn: ({ q, id }: { q: string; id: string }) => apiFetch(`/api/admin/jobs/${q}/${id}/retry`, { method: "POST", token }),
    onSuccess: () => {
      toast.success("Job requeued for retry");
      query.refetch();
    },
    onError: (e, { q, id }) => toast.error(e instanceof Error ? e.message : `Failed to retry ${id} (${q})`),
  });

  const totalQueueFailures = Object.values(query.data?.queues ?? {}).reduce((a, q) => a + (q.failed ?? 0), 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Background Jobs</h1>
        <p className="text-sm text-muted-foreground">
          BullMQ queues · {totalQueueFailures > 0 ? `${totalQueueFailures} failed across queues` : "no failed jobs"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {QUEUE_LIST.map((name) => {
          const q = query.data?.queues?.[name];
          return (
            <button
              key={name}
              type="button"
              onClick={() => setQueue(name)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors",
                queue === name ? "border-brand/40 bg-brand/5" : "border-line bg-white shadow-soft"
              )}
            >
              <p className="text-sm font-semibold capitalize">{name}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {q ? `${q.waiting} waiting · ${q.active} active` : <Skeleton className="h-4 w-16" />}
                </span>
                {q && q.failed > 0 && <Badge variant="red">{q.failed}</Badge>}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATES.map((s) => (
          <Button key={s} size="sm" variant={state === s ? "brand" : "outline"} onClick={() => setState(s)}>
            {s}
          </Button>
        ))}
      </div>

      <Card className="mt-6 overflow-hidden rounded-2xl">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold capitalize">
            {state} jobs · {queue}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-4">
          {query.isLoading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : query.data?.recent?.length === 0 ? (
            <EmptyState title={`No ${state} jobs`} description={`Nothing ${state} in the ${queue} queue.`} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data?.recent?.map((j) => (
                  <TableRow key={`${j.queue}-${j.id}`}>
                    <TableCell>
                      <p className="font-medium">{j.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{j.id}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="gray">{j.attempts}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{j.timestamp ? timeAgo(new Date(j.timestamp)) : "pending"}</TableCell>
                    <TableCell>
                      {j.error ? (
                        <p className="line-clamp-2 max-w-xs text-xs text-red-600" title={j.error}>
                          {j.error}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {j.status === "failed" && (
                        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" loading={retry.isPending} onClick={() => retry.mutate({ q: j.queue, id: j.id })}>
                          <RotateCcw className="h-3.5 w-3.5" /> Retry
                        </Button>
                      )}
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