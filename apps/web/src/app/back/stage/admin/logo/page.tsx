"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { ImagePlus, Trash2, Save, Loader2 } from "lucide-react";
import { apiFetch, getToken, apiUrl } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type LogoStatus = { hasLogo: boolean; mime?: string; size?: number; updatedAt?: string };

export default function AdminLogoPage() {
  const token = getToken();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const status = useQuery<LogoStatus>({
    queryKey: ["admin-logo-status"],
    queryFn: () => apiFetch("/api/admin/logo/status", { token }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiFetch<LogoStatus>("/api/admin/logo", { method: "POST", formData: fd, token });
    },
    onSuccess: () => {
      toast.success("Logo uploaded");
      status.refetch();
      setPreview(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch<LogoStatus>("/api/admin/logo", { method: "DELETE", token }),
    onSuccess: () => {
      toast.success("Logo removed");
      status.refetch();
      setPreview(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentUrl = apiUrl("/api/logo");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Logo</h1>
        <p className="text-sm text-muted-foreground">The logo is stored as a binary blob in the database and shown across the public site.</p>
      </div>

      <Alert>
        <ImagePlus className="h-4 w-4" />
        <AlertTitle>How it works</AlertTitle>
        <AlertDescription>
          The logo file is uploaded and saved directly into your database as a <code className="font-mono text-xs">bytea</code> blob — no filesystem required.
          Supported formats: PNG, JPEG, WebP (max 5 MB).
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Current logo as shown on the site</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {status.isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : status.data?.hasLogo ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={currentUrl}
                  alt="Site logo preview"
                  className="h-20 w-auto rounded-lg bg-white/20 object-contain p-2 ring-1 ring-border"
                />
                <p className="text-xs text-muted-foreground">
                  {status.data.mime} · {status.data.size ? `${(status.data.size / 1024).toFixed(1)} KB` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No logo uploaded yet. Upload one on the right.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload</CardTitle>
            <CardDescription>Replace or remove the current logo</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setPreview(URL.createObjectURL(file));
                  }}
                />
                <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="gap-2">
                  <ImagePlus className="h-4 w-4" /> Choose file
                </Button>
                <span className="text-xs text-muted-foreground">
                  {preview ? "File selected" : status.data?.hasLogo ? "Keep current logo" : "No file"}
                </span>
              </div>
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Selected logo" className="h-20 w-auto rounded-lg bg-white/20 object-contain p-2 ring-1 ring-border" />
              )}
              <Button
                type="button"
                className="w-full gap-2"
                disabled={!preview || upload.isPending}
                onClick={() => {
                  const file = inputRef.current?.files?.[0];
                  if (file) upload.mutate(file);
                }}
              >
                {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Upload logo
              </Button>
              {status.data?.hasLogo && (
                <Button type="button" variant="destructive" className="w-full gap-2" disabled={remove.isPending} onClick={() => remove.mutate()}>
                  <Trash2 className="h-4 w-4" /> Remove logo
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
