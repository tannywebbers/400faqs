"use client";

import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, Upload } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePhone } from "@/hooks/use-phone";
import { PhoneBar } from "@/components/app/phone-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const schema = z.object({
  categorySlug: z.string().min(1, "Select a category"),
  reason: z.enum(["DUPLICATE", "WRONG_ANSWER", "INAPPROPRIATE", "SPAM", "OFF_TOPIC", "OTHER"]),
  questionText: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

type Category = { slug: string; name: string; questionCount: number };

type ReportResult = { ticket: string; status: string; message: string };

export default function AppReportPage() {
  const { phone } = usePhone();
  const [result, setResult] = useState<ReportResult | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const categories = useQuery<Category[]>({
    queryKey: ["app-categories", "alphabetical"],
    queryFn: () => apiFetch("/api/public/categories?limit=100&sort=alphabetical"),
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (!phone) {
      toast.error("Enter your WhatsApp number first");
      return;
    }
    try {
      const form = new FormData();
      form.append("reporterPhone", phone);
      form.append("categorySlug", values.categorySlug);
      form.append("reason", values.reason);
      if (values.questionText) form.append("questionText", values.questionText);
      if (values.notes) form.append("notes", values.notes);
      if (file) form.append("screenshot", file);

      const data = await apiFetch<ReportResult>("/api/public/reports", { method: "POST", formData: form });
      setResult(data);
      toast.success(`Report submitted. Ticket ${data.ticket}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report failed");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Report a Question</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Help keep the 400faqs library clean. Our moderation team reviews every report.
        </p>
      </div>

      <PhoneBar />

      {result ? (
        <Alert variant="success">
          <AlertTitle>Report received</AlertTitle>
          <AlertDescription>
            <p>{result.message}</p>
            <p className="mt-2 font-mono text-xs">Ticket: {result.ticket}</p>
            <a href="/app/reports" className="mt-2 inline-block text-xs font-semibold underline">
              Track it in My Reports →
            </a>
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label>Category</Label>
            {!categories.data ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select onValueChange={(v) => setValue("categorySlug", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.data.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.categorySlug && <p className="text-sm text-red-600">{errors.categorySlug.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Question (paste the text)</Label>
            <Input placeholder="The question you are reporting" {...register("questionText")} />
            {errors.questionText && <p className="text-sm text-red-600">{errors.questionText.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Select onValueChange={(v) => setValue("reason", v as FormValues["reason"])}>
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DUPLICATE">Duplicate question</SelectItem>
                <SelectItem value="WRONG_ANSWER">Wrong answer</SelectItem>
                <SelectItem value="INAPPROPRIATE">Inappropriate content</SelectItem>
                <SelectItem value="SPAM">Spam</SelectItem>
                <SelectItem value="OFF_TOPIC">Off-topic</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
            {errors.reason && <p className="text-sm text-red-600">{errors.reason.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Additional notes (optional)</Label>
            <Textarea rows={3} placeholder="Any extra context..." {...register("notes")} />
          </div>

          <div className="space-y-2">
            <Label>Screenshot (optional)</Label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface p-6 text-sm text-muted-foreground transition-colors hover:border-brand/40 hover:bg-brand/5">
              <Upload className="h-5 w-5" />
              {file ? file.name : "Click to upload a screenshot (max 5MB, png/jpeg/webp)"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <Button type="submit" loading={isSubmitting} variant="destructive">
            {!isSubmitting && <ShieldAlert className="h-4 w-4" />} Submit Report
          </Button>
        </form>
      )}
    </div>
  );
}