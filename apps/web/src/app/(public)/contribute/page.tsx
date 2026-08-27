"use client";

import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldCheck, Sparkles } from "lucide-react";
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
  userPhone: z.string().min(8, "Enter your WhatsApp number with country code (e.g. 14155552671)").max(20),
  categoryId: z.string().min(1, "Select a category"),
  question: z.string().min(3, "Question must be at least 3 characters").max(300, "Question too long"),
  type: z.enum(["NORMAL", "TRUTH", "DARE"]).default("NORMAL"),
});

type FormValues = z.infer<typeof schema>;

type Outcome = {
  ticket: string;
  status: string;
  message: string;
  moderation: { ok: boolean; score: number; reason: string | null };
  duplicate: { exact: boolean; similar: boolean; score: number } | null;
};

export default function ContributePage() {
  const [result, setResult] = useState<Outcome | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["public-categories", "", "newest", 1],
    queryFn: () => apiFetch<{ id: string; name: string; questionCount: number }[]>("/api/public/categories?limit=100&sort=alphabetical"),
  });

  const { data: settings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => apiFetch<Record<string, string>>("/api/public/settings"),
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: "NORMAL" } });

  const enabled = settings?.["contribution.enabled"] !== "false";

  const onSubmit = async (values: FormValues) => {
    try {
      const data = await apiFetch<Outcome>("/api/public/contributions", { method: "POST", body: values });
      setResult(data);
      if (data.status === "APPROVED") {
        toast.success("Question approved and added!");
      } else if (data.status === "REJECTED") {
        toast.error("Question rejected");
      } else {
        toast.info("Submission received for review");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    }
  };

  return (
    <Container className="py-10">
      <PageHeader
        title="Contribute a Question"
        description="Add a question to the 400QUES library. Every submission is checked by AI for grammar, profanity, spam and duplicates."
      />

      {!enabled ? (
        <Alert variant="warning">
          <AlertTitle>Contributions are temporarily disabled</AlertTitle>
          <AlertDescription>Please check back later.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>New Question</CardTitle>
              <CardDescription>Fill in the form below and hit submit.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <div className="space-y-2">
                  <Label htmlFor="userPhone">Your WhatsApp number</Label>
                  <Input
                    id="userPhone"
                    placeholder="e.g. 14155552671"
                    {...register("userPhone")}
                  />
                  {errors.userPhone && <p className="text-sm text-red-600">{errors.userPhone.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  {!categories ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select onValueChange={(v) => setValue("categoryId", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} ({c.questionCount})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {errors.categoryId && <p className="text-sm text-red-600">{errors.categoryId.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select onValueChange={(v) => setValue("type", v as FormValues["type"])} defaultValue="NORMAL">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NORMAL">Question</SelectItem>
                      <SelectItem value="TRUTH">Truth</SelectItem>
                      <SelectItem value="DARE">Dare</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="question">Question</Label>
                  <Textarea
                    id="question"
                    placeholder="e.g. What is the most embarrassing thing you've done in public?"
                    rows={4}
                    maxLength={300}
                    {...register("question")}
                  />
                  <div className="flex items-center justify-between">
                    {errors.question ? (
                      <p className="text-sm text-red-600">{errors.question.message}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{watch("question")?.length ?? 0}/300</p>
                    )}
                  </div>
                </div>

                <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto">
                  {!isSubmitting && <Sparkles className="h-4 w-4" />} Submit for review
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" /> Automated checks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Grammar & readability</li>
                  <li>• Profanity detection</li>
                  <li>• Spam detection</li>
                  <li>• Duplicate & similarity matching</li>
                  <li>• Daily submission limits</li>
                </ul>
              </CardContent>
            </Card>

            {result && (
              <Alert variant={result.status === "REJECTED" ? "error" : result.status === "APPROVED" ? "success" : "default"}>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>
                  {result.status === "APPROVED" ? "Approved!" : result.status === "REJECTED" ? "Rejected" : result.status === "FLAGGED" ? "Flagged for review" : "Pending review"}
                </AlertTitle>
                <AlertDescription>
                  <p>{result.message}</p>
                  {result.ticket && <p className="mt-2 font-mono text-xs">Ticket: {result.ticket}</p>}
                  <p className="mt-2 text-xs opacity-80">AI quality score: {Math.round(result.moderation.score * 100)}%</p>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>
      )}
    </Container>
  );
}
