"use client";

import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { Upload, ShieldAlert } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const schema = z.object({
  reporterPhone: z.string().min(8).max(20),
  categorySlug: z.string().min(1, "Select a category"),
  reason: z.enum(["DUPLICATE", "WRONG_ANSWER", "INAPPROPRIATE", "SPAM", "OFF_TOPIC", "OTHER"]),
  notes: z.string().max(1000).optional(),
  questionText: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

type ReportResult = { ticket: string; status: string; message: string };

export default function ReportPage() {
  const [result, setResult] = useState<ReportResult | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["public-categories", "", "alphabetical", 1],
    queryFn: () => apiFetch<{ slug: string; name: string }[]>("/api/public/categories?limit=100&sort=alphabetical"),
  });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      const form = new FormData();
      form.append("reporterPhone", values.reporterPhone);
      form.append("categorySlug", values.categorySlug);
      form.append("reason", values.reason);
      if (values.notes) form.append("notes", values.notes);
      if (values.questionText) form.append("questionText", values.questionText);
      if (file) form.append("screenshot", file);

      const data = await apiFetch<ReportResult>("/api/public/reports", { method: "POST", formData: form });
      setResult(data);
      toast.success(`Report submitted. Ticket ${data.ticket}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report failed");
    }
  };

  return (
    <Container className="py-10">
      <PageHeader title="Report a Question" description="Help keep the 400QUES library clean. Reports are reviewed by our moderation team." />

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Report Form</CardTitle>
            <CardDescription>Select the category and describe the problem.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label>Category</Label>
                {!categories ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select onValueChange={(v) => setValue("categorySlug", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
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
                <Label htmlFor="reporterPhone">Your WhatsApp number</Label>
                <Input id="reporterPhone" placeholder="e.g. 14155552671" {...register("reporterPhone")} />
                {errors.reporterPhone && <p className="text-sm text-red-600">{errors.reporterPhone.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="questionText">Question (paste the text)</Label>
                <Input id="questionText" placeholder="The question you are reporting" {...register("questionText")} />
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
                <Label htmlFor="notes">Additional notes (optional)</Label>
                <Textarea id="notes" rows={3} placeholder="Any extra context..." {...register("notes")} />
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
          </CardContent>
        </Card>

        <div className="space-y-6">
          {result && (
            <Alert variant="success">
              <AlertTitle>Report received</AlertTitle>
              <AlertDescription>
                <p>{result.message}</p>
                <p className="mt-2 font-mono text-xs">Ticket: {result.ticket}</p>
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle>What happens next?</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                <li>You get a ticket number for tracking.</li>
                <li>Admins are notified immediately.</li>
                <li>Our team reviews and resolves the report.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}
