"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";
import { Eye } from "lucide-react";
import { apiFetch, getToken } from "@/lib/api";
import { useAdminList } from "@/hooks/use-admin-list";
import { AdminToolbar } from "@/components/admin/table-toolbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Pagination } from "@/components/pagination";
import { formatDate, maskPhone } from "@/lib/utils";

type User = {
  id: string;
  phone: string;
  name: string | null;
  status: "ACTIVE" | "BLOCKED" | "LEFT";
  isPremium: boolean;
  isContributor: boolean;
  invitedCount: number;
  contributionCount: number;
  approvedContributionCount: number;
  sessionsPlayed: number;
  badges: { id: string; name: string }[];
  joinedAt: string;
  lastActiveAt: string | null;
};

export default function AdminUsersPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<User | null>(null);

  const list = useAdminList<User>({ path: "/api/admin/users", limit: 20 });

  const userQuery = useQuery<User | null>({
    queryKey: ["admin-user", viewing?.id],
    queryFn: () => (viewing ? apiFetch(`/api/admin/users/${viewing.id}`, { token }) : Promise.resolve(null)),
    enabled: !!viewing,
  });

  const updateStatus = useMutation({
    mutationFn: (status: User["status"]) =>
      apiFetch(`/api/admin/users/${viewing?.id}`, { method: "PATCH", token, body: { status } }),
    onSuccess: () => {
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
      qc.invalidateQueries({ queryKey: ["admin-user"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const data = list.data;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">Manage players across the platform</p>
      </div>

      <AdminToolbar
        search={list.q}
        onSearch={list.setQ}
        searchPlaceholder="Search by name or phone..."
        status={list.status}
        onStatusChange={list.setStatus}
        statusOptions={[
          { label: "All", value: "all" },
          { label: "Active", value: "ACTIVE" },
          { label: "Blocked", value: "BLOCKED" },
          { label: "Left", value: "LEFT" },
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
          <EmptyState title="No users" description="Users will appear once people start playing." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Premium</TableHead>
                <TableHead>Invites</TableHead>
                <TableHead>Contributions</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Badges</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <p className="font-medium">{u.name ?? maskPhone(u.phone)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{u.phone}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.status === "ACTIVE" ? "green" : u.status === "BLOCKED" ? "red" : "gray"}>{u.status}</Badge>
                  </TableCell>
                  <TableCell>{u.isPremium ? <Badge variant="purple">Premium</Badge> : "—"}</TableCell>
                  <TableCell>{u.invitedCount}</TableCell>
                  <TableCell>{u.contributionCount}</TableCell>
                  <TableCell>{u.sessionsPlayed}</TableCell>
                  <TableCell>
                    {u.badges.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {u.badges.slice(0, 3).map((b) => (
                          <Badge key={b.id} variant="gray">{b.name}</Badge>
                        ))}
                        {u.badges.length > 3 && <Badge variant="gray">+{u.badges.length - 3}</Badge>}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(u.joinedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setViewing(u)}>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          {userQuery.data && (
            <div className="space-y-4">
              <div className="rounded-xl bg-surface p-4">
                <p className="text-lg font-semibold">{userQuery.data.name ?? maskPhone(userQuery.data.phone)}</p>
                <p className="font-mono text-sm text-muted-foreground">{userQuery.data.phone}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>Joined {formatDate(userQuery.data.joinedAt)}</span>
                  <span>·</span>
                  <span>Last active {userQuery.data.lastActiveAt ? formatDate(userQuery.data.lastActiveAt) : "never"}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-surface p-3"><p className="text-lg font-bold">{userQuery.data.invitedCount}</p><p className="text-xs text-muted-foreground">Invites</p></div>
                <div className="rounded-xl bg-surface p-3"><p className="text-lg font-bold">{userQuery.data.contributionCount}</p><p className="text-xs text-muted-foreground">Contributions</p></div>
                <div className="rounded-xl bg-surface p-3"><p className="text-lg font-bold">{userQuery.data.approvedContributionCount}</p><p className="text-xs text-muted-foreground">Approved</p></div>
                <div className="rounded-xl bg-surface p-3"><p className="text-lg font-bold">{userQuery.data.sessionsPlayed}</p><p className="text-xs text-muted-foreground">Sessions</p></div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={userQuery.data.status} onValueChange={(v) => updateStatus.mutate(v as User["status"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="BLOCKED">Blocked</SelectItem>
                    <SelectItem value="LEFT">Left</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
