"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useState } from "react";
import { Plus, Trash2, ShieldCheck, UserCircle } from "lucide-react";
import { apiFetch, getToken, getAdminUser } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/utils";

type Admin = { id: string; name: string; email: string; role: "SUPER_ADMIN" | "ADMIN" | "MODERATOR"; lastLoginAt: string | null; isActive: boolean; createdAt: string };

const schema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "MODERATOR"]),
});

type FormValues = z.infer<typeof schema>;

const ROLE_BADGE: Record<Admin["role"], "purple" | "blue" | "gray"> = {
  SUPER_ADMIN: "purple",
  ADMIN: "blue",
  MODERATOR: "gray",
};

export default function AdminAdminsPage() {
  const token = getToken();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const current = getAdminUser();

  const query = useQuery<Admin[]>({
    queryKey: ["admin-admins"],
    queryFn: () => apiFetch("/api/admin/admins", { token }),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", role: "ADMIN" },
  });

  const create = useMutation({
    mutationFn: (values: FormValues) => apiFetch("/api/admin/admins", { method: "POST", token, body: values }),
    onSuccess: () => {
      toast.success("Admin created");
      setDialogOpen(false);
      form.reset();
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Create failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/admins/${id}`, { method: "DELETE", token }),
    onSuccess: () => {
      toast.success("Admin removed");
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const data = query.data ?? [];

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admins</h1>
          <p className="text-sm text-muted-foreground">Manage panel access for your team</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> Add Admin
        </Button>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState icon={ShieldCheck} title="No admins" description="Add your first admin to get started." />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((a) => {
            const isSelf = a.email === current?.email;
            return (
              <Card key={a.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-brand text-base font-bold text-white">
                        {a.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold">
                          {a.name} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">{a.email}</p>
                      </div>
                    </div>
                    {a.role === "SUPER_ADMIN" ? <UserCircle className="h-5 w-5 text-purple-600" /> : <ShieldCheck className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={ROLE_BADGE[a.role]}>{a.role.replace("_", " ")}</Badge>
                      <Badge variant={a.isActive ? "green" : "gray"}>{a.isActive ? "Active" : "Disabled"}</Badge>
                    </div>
                    {!isSelf && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600"
                        title="Remove"
                        onClick={() => { if (window.confirm(`Remove ${a.name}?`)) remove.mutate(a.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Added {formatDate(a.createdAt)} · Last login {a.lastLoginAt ? formatDate(a.lastLoginAt) : "never"}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Admin</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input {...form.register("name")} placeholder="Full name" />
              {form.formState.errors.name && <p className="text-sm text-red-600">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" {...form.register("email")} placeholder="admin@400ques.com" />
              {form.formState.errors.email && <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Temporary password</Label>
              <Input type="password" {...form.register("password")} />
              {form.formState.errors.password && <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={form.watch("role")} onValueChange={(v) => form.setValue("role", v as FormValues["role"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="MODERATOR">Moderator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create Admin
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
