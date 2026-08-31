"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Mail, MailOpen } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminToolbar } from "@/components/admin/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { formatDateTime } from "@/lib/utils";

type Message = { id: string; name: string; email: string; subject: string; message: string; status: "NEW" | "READ" | "RESPONDED"; createdAt: string };

export default function AdminContactPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<Message | null>(null);

  const list = useAdminList<Message>({ path: "/api/admin/contact" });

  const markStatus = useMutation({
    mutationFn: (status: Message["status"]) =>
      apiFetch(`/api/admin/contact/${viewing?.id}`, { method: "PATCH", token, body: { status } }),
    onSuccess: () => {
      toast.success("Message updated");
      qc.invalidateQueries({ queryKey: ["/api/admin/contact"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const data = list.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Contact Messages</h1>
        <p className="text-sm text-muted-foreground">Messages submitted through the contact form</p>
      </div>

      <AdminToolbar
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search messages..."
        status={list.status}
        onStatusChange={list.setStatus}
        statusOptions={[
          { label: "All", value: "all" },
          { label: "New", value: "NEW" },
          { label: "Read", value: "READ" },
          { label: "Responded", value: "RESPONDED" },
        ]}
      />

      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        {list.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <EmptyState title="No messages" description="Contact form submissions will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm font-medium">{m.subject}</p>
                  </TableCell>
                  <TableCell className="max-w-sm">
                    <p className="line-clamp-2 text-sm text-muted-foreground">{m.message}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.status === "NEW" ? "orange" : m.status === "READ" ? "blue" : "green"}>{m.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setViewing(m)}>
                      View
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
            <DialogTitle>Message from {viewing?.name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold">{viewing.subject}</p>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{viewing.message}</p>
                </CardContent>
              </Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a href={`mailto:${viewing.email}?subject=Re: ${viewing.subject}`} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
                  <Mail className="h-4 w-4" /> Reply via Email
                </a>
                <div className="flex gap-2">
                  {viewing.status === "NEW" && (
                    <Button variant="outline" onClick={() => markStatus.mutate("READ")}>
                      <MailOpen className="h-4 w-4" /> Mark Read
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => markStatus.mutate("RESPONDED")}>
                    Mark Responded
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
