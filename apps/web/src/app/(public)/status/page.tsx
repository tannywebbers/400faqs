"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Server, MessageCircle, Database, GitBranch, Globe, Activity } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SystemStatus = {
  server: { status: string; message: string };
  whatsapp: { status: string; message: string };
  database: { status: string; message: string };
  redis: { status: string; message: string };
  webhook: { status: string; message: string };
  version: string;
  lastDeployment: string;
  platform: string;
  uptimeSeconds: number;
};

const COMPONENTS: { key: keyof Pick<SystemStatus, "server" | "whatsapp" | "database" | "redis" | "webhook">; label: string; icon: typeof Server }[] = [
  { key: "server", label: "API Server", icon: Server },
  { key: "whatsapp", label: "WhatsApp API", icon: MessageCircle },
  { key: "database", label: "Database", icon: Database },
  { key: "redis", label: "Redis / Queue", icon: GitBranch },
  { key: "webhook", label: "Webhook", icon: Globe },
];

export default function StatusPage() {
  const [refreshing, setRefreshing] = useState(false);

  const query = useQuery<SystemStatus>({
    queryKey: ["system-status"],
    queryFn: () => apiFetch("/api/public/status"),
    refetchInterval: 60_000,
  });

  const refresh = async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  };

  const data = query.data;
  const allOperational = data && Object.values({ server: data.server, whatsapp: data.whatsapp, database: data.database, redis: data.redis, webhook: data.webhook }).every((c) => c.status === "operational");

  return (
    <Container className="py-10">
      <PageHeader title="System Status" description="Real-time status of the 400QUES platform.">
        <Button variant="outline" size="sm" onClick={refresh} loading={refreshing || query.isFetching}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </PageHeader>

      <Card className={cn("mb-8", allOperational ? "border-primary/20 bg-primary/5" : "border-red-200 bg-red-50")}>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <span className={cn("relative flex h-3 w-3")}>
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", allOperational ? "bg-primary" : "bg-red-500")} />
              <span className={cn("relative inline-flex h-3 w-3 rounded-full", allOperational ? "bg-primary" : "bg-red-500")} />
            </span>
            <div className="text-left">
              <p className="font-semibold">{allOperational ? "All systems operational" : "Some systems degraded"}</p>
              <p className="text-sm text-muted-foreground">Last checked {data ? new Date().toLocaleTimeString() : "..."}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>v{data?.version ?? "—"}</span>
            <span>{data?.platform ?? "—"}</span>
            <span>{data ? Math.floor(data.uptimeSeconds / 60) : 0}m uptime</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {COMPONENTS.map((c) => {
          const status = data?.[c.key];
          return (
            <div key={c.key} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                  <c.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                {status ? (
                  <Badge variant={status.status === "operational" ? "green" : "red"}>{status.status}</Badge>
                ) : (
                  <Skeleton className="h-5 w-16" />
                )}
              </div>
              <p className="mt-3 text-sm font-semibold">{c.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{status?.message ?? "Checking..."}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Activity className="h-4 w-4" />
        Last deployment: {data?.lastDeployment ? new Date(data.lastDeployment).toLocaleString() : "—"}
      </div>
    </Container>
  );
}
