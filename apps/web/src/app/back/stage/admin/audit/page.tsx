"use client";

import { useQuery } from "@tanstack/react-query";
import { listAuditLogs, type AuditLogEntry } from "@/lib/admin/system";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminToolbar } from "@/components/admin/table-toolbar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { formatDateTime } from "@/lib/utils";

const ACTION_COLORS: Record<string, "green" | "red" | "orange" | "blue" | "gray"> = {
  CREATE: "green",
  UPDATE: "orange",
  DELETE: "red",
  APPROVE: "green",
  REJECT: "red",
  LOGIN: "blue",
  LOGOUT: "gray",
};

export default function AdminAuditPage() {
  const list = useAdminList<AuditLogEntry>({
    queryKey: "admin-audit",
    queryFn: (p) => listAuditLogs({ page: p.page, limit: p.limit, q: p.q, action: p.status || undefined }),
    limit: 20,
  });

  const data = list.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Every admin action, recorded</p>
      </div>

      <AdminToolbar
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search by action, entity or admin..."
        status={list.status}
        onStatusChange={list.setStatus}
        statusOptions={[
          { label: "All", value: "all" },
          { label: "Create", value: "CREATE" },
          { label: "Update", value: "UPDATE" },
          { label: "Delete", value: "DELETE" },
          { label: "Login", value: "LOGIN" },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {list.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <EmptyState title="No log entries" description="Admin actions will be recorded here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admin</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <p className="font-medium">{log.admin.name}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_COLORS[log.action] ?? "gray"}>{log.action}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="gray">{log.targetType}</Badge>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <p className="line-clamp-1 text-sm text-muted-foreground">
                      {log.details ? JSON.stringify(log.details) : "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(log.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination page={list.page} totalPages={data?.totalPages ?? 1} total={data?.total ?? 0} limit={20} onPageChange={list.setPage} className="mt-4" />
    </div>
  );
}
