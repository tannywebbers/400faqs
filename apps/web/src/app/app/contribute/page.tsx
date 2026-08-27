"use client";

import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Sparkles } from "lucide-react";
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

const baseSchema = z.object({
  categoryId: z.string().min(1, "Select a category"),
  question: z.string().min(3, "Question must be at least 3 characters").max(300, "Question too long"),
  type: z.enum(["TRUTH", "DARE", "NORMAL"]),
});

type FormValues = z.infer<typeof baseSchema>;

type Category = { id: string; name: string; slug: string; gameType: "NORMAL" | "TRUTH_DARE"; questionCount: number };

type Outcome = {
  ticket: string;
  status: string;
  message: string;
  moderation: { ok: boolean; score: number; reason: string | null };
  duplicate: { exact: boolean; similar: boolean; score: number } | null;
};

export default function AppContributePage() {
  const { phone, setPhone } = usePhone();
  const [result, setResult] = useState<Outcome | null>(null);

  const categories = useQuery<Category[]>({
    queryKey: ["app-categories", "alphabetical"],
    queryFn: () => apiFetch("/api/public/categories?limit=100&sort=alphabetical"),
  });

  const settings = useQuery<Record<string, string>>({
    queryKey: ["public-settings"],
    queryFn: () => apiFetch("/api/public/settings"),
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: { type: "NORMAL", question: "" },
  });

  const enabled = settings.data?.["contribution.enabled"] !== "false";
  const selectedCategory = watch("categoryId");
  const selected = categories.data?.find((c) => c.id === selectedCategory);
  const isTruthDare = selected?.gameType === "TRUTH_DARE";

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = { ...values, userPhone: phone };
      const data = await apiFetch<Outcome>("/api/public/contributions", { method: "POST", body: payload });
      setResult(data);
      if (data.status === "APPROVED") toast.success("Question approved and added!");
      else if (data.status === "REJECTED") toast.error("Question rejected");
      else toast.info("Submission received for review");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Contribute a Question</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every submission is checked by AI for grammar, profanity, spam and duplicates before it reaches the library.
        </p>
      </div>

      <PhoneBar />

      {!phone ? (
        <PhonePrompt onSave={setPhone} />
      ) : result ? (
        <Alert variant={result.status === "REJECTED" ? "error" : result.status === "APPROVED" ? "success" : "default"}>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>
            {result.status === "APPROVED" ? "Approved!" : result.status === "REJECTED" ? "Rejected" : result.status === "FLAGGED" ? "Flagged for review" : "Pending review"}
          </AlertTitle>
          <AlertDescription>
            <p>{result.message}</p>
            {result.ticket && <p className="mt-2 font-mono text-xs">Ticket: {result.ticket}</p>}
            {result.moderation && (
              <p className="mt-2 text-xs opacity-80">AI quality score: {Math.round(result.moderation.score * 100)}%</p>
            )}
            <LinkToHistory />
          </AlertDescription>
        </Alert>
      ) : !enabled ? (
        <Alert variant="warning">
          <AlertTitle>Contributions are temporarily disabled</AlertTitle>
          <AlertDescription>Please check back later.</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label>Category</Label>
            {!categories.data ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select
                value={selectedCategory || undefined}
                onValueChange={(v) => {
                  setValue("categoryId", v, { shouldValidate: true });
                  const cat = categories.data.find((c) => c.id === v);
                  if (cat && cat.gameType === "TRUTH_DARE" && watch("type") === "NORMAL") setValue("type", "TRUTH");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.data.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.questionCount})
                      {c.gameType === "TRUTH_DARE" ? " · Truth or Dare" : " · Questions"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.categoryId && <p className="text-sm text-red-600">{errors.categoryId.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            {isTruthDare ? (
              <Select value={watch("type")} onValueChange={(v) => setValue("type", v as FormValues["type"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TRUTH">Truth</SelectItem>
                  <SelectItem value="DARE">Dare</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value="NORMAL" onValueChange={() => setValue("type", "NORMAL")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NORMAL">Question</SelectItem>
                </SelectContent>
              </Select>
            )}
            {selected && (
              <p className="text-xs text-muted-foreground">
                {isTruthDare ? "This category accepts Truth or Dare questions." : "This category accepts standard questions."}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Question</Label>
            <Textarea
              rows={4}
              maxLength={300}
              placeholder={isTruthDare ? "e.g. What is the most embarrassing thing you've done in public?" : "e.g. What is the capital of France?"}
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

          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-muted-foreground">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
            <p>Automated checks: grammar, profanity, spam, duplicates via Google AI, and daily limits.</p>
          </div>

          <Button type="submit" loading={isSubmitting}>
            {!isSubmitting && <Sparkles className="h-4 w-4" />} Submit for review
          </Button>
        </form>
      )}
    </div>
  );
}

function PhonePrompt({ onSave }: { onSave: (phone: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <p className="text-sm text-muted-foreground">
        Enter your WhatsApp number below so we can link this submission to you. It stays on your device.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="e.g. 14155552671" inputMode="tel" value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1" />
        <Button onClick={() => onSave(draft)} disabled={draft.trim().length < 8} className="sm:w-28">
          Save
        </Button>
      </div>
    </div>
  );
}

function LinkToHistory() {
  return (
    <a href="/app/contributions" className="mt-2 inline-block text-xs font-semibold underline">
      Track it in My Questions →
    </a>
  );
}