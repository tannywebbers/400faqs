"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listJobs } from "@/lib/admin/system";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

type QueueCounts = { waiting: number; active: number; completed: number; failed: number; delayed: number; paused: number };

const QUEUE_LIST = ["moderation", "game", "notification", "snapshot"];
const STATES = ["failed", "active", "waiting", "completed", "delayed"] as const;

export default function AdminJobsPage() {
  const [queue, setQueue] = useState("notification");
  const [state, setState] = useState<(typeof STATES)[number]>("failed");

  const query = useQuery<{ queues: Record<string, QueueCounts>; recent: unknown[] }>({
    queryKey: ["admin-jobs"],
    queryFn: () => listJobs(),
    refetchInterval: 30_000,
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
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              state === s ? "border-brand bg-brand text-white" : "border-line bg-white text-muted-foreground hover:bg-surface"
            )}
          >
            {s}
          </button>
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
          ) : (query.data?.recent?.length ?? 0) === 0 ? (
            <EmptyState title={`No ${state} jobs`} description={`Nothing ${state} in the ${queue} queue.`} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.recent as { id: string; name: string; attempts: number; timestamp: number | null; error?: string }[]).map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      <p className="font-medium">{j.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{j.id}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="gray">{j.attempts}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{j.timestamp ? new Date(j.timestamp).toLocaleString() : "pending"}</TableCell>
                    <TableCell>
                      {j.error ? (
                        <p className="line-clamp-2 max-w-xs text-xs text-red-600" title={j.error}>
                          {j.error}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
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
