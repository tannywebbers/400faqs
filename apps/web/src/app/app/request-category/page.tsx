"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { Layers } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePhone } from "@/hooks/use-phone";
import { PhoneBar } from "@/components/app/phone-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  description: z.string().min(10, "Description must be at least 10 characters").max(500),
  examples: z.string().max(1000).optional(),
  reason: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

type RequestResult = { id: string; status: string; message: string };

export default function AppRequestCategoryPage() {
  const { phone, setPhone } = usePhone();
  const [result, setResult] = useState<RequestResult | null>(null);
  const [draftPhone, setDraftPhone] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (!phone) {
      toast.error("Enter your WhatsApp number first");
      return;
    }
    try {
      const payload = { ...values, requestorPhone: phone };
      const data = await apiFetch<RequestResult>("/api/public/category-requests", { method: "POST", body: payload });
      setResult(data);
      toast.success(data.message);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Request a Category</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Don't see a topic you love? Tell us and we'll consider adding it to 400QUES.
        </p>
      </div>

      {!phone && (
        <div className="mb-6 rounded-2xl border border-line bg-white p-6">
          <p className="text-sm text-muted-foreground">Enter your WhatsApp number so we can link this request to you.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Input placeholder="e.g. 14155552671" inputMode="tel" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} className="flex-1" />
            <Button onClick={() => setPhone(draftPhone)} disabled={draftPhone.trim().length < 8} className="sm:w-28">
              Save
            </Button>
          </div>
        </div>
      )}

      <PhoneBar />

      {result ? (
        <Alert variant="success">
          <Layers className="h-4 w-4" />
          <AlertTitle>Request received</AlertTitle>
          <AlertDescription>
            <p>{result.message}</p>
            <a href="/app/requests" className="mt-2 inline-block text-xs font-semibold underline">
              Track it in My Requests →
            </a>
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label>Category name</Label>
            <Input placeholder="e.g. Pop Culture 2024" {...register("name")} />
            {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={3} placeholder="What is this category about?" {...register("description")} />
            {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Example questions (optional)</Label>
            <Textarea rows={2} placeholder="A few example questions you'd like to see..." {...register("examples")} />
          </div>

          <div className="space-y-2">
            <Label>Why do you want it? (optional)</Label>
            <Textarea rows={2} placeholder="A short reason..." {...register("reason")} />
          </div>

          <Button type="submit" loading={isSubmitting} disabled={!phone}>
            <Layers className="h-4 w-4" /> Submit Request
          </Button>
        </form>
      )}
    </div>
  );
}