"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { FolderPlus } from "lucide-react";
import { submitCategoryRequest } from "@/lib/queries/public-client";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  description: z.string().min(10, "Description must be at least 10 characters").max(500),
  examples: z.string().max(1000).optional(),
  reason: z.string().max(500).optional(),
  requestorPhone: z.string().min(8, "Enter your WhatsApp number with country code").max(20),
});

type FormValues = z.infer<typeof schema>;
type Result = { id: string; status: string; message: string };

export default function RequestCategoryPage() {
  const [result, setResult] = useState<Result | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      const data = await submitCategoryRequest(values);
      setResult(data);
      toast.success("Category request submitted!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    }
  };

  return (
    <Container className="py-10">
      <PageHeader title="Request a New Category" description="Got an idea for a category? Suggest it and the community can vote with their questions." />

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Category Request</CardTitle>
            <CardDescription>Tell us what category should exist.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label htmlFor="name">Category name</Label>
                <Input id="name" placeholder="e.g. Pop Culture Trivia" {...register("name")} />
                {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" rows={3} placeholder="What is this category about?" {...register("description")} />
                {errors.description && <p className="text-sm text-red-600">{errors.description.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="examples">Example questions</Label>
                <Textarea id="examples" rows={4} placeholder="1. ...\n2. ...\n3. ..." {...register("examples")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Why do you want this category?</Label>
                <Textarea id="reason" rows={3} placeholder="Optional — tell us why it would be fun." {...register("reason")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="requestorPhone">Your WhatsApp number</Label>
                <Input id="requestorPhone" placeholder="e.g. 14155552671" {...register("requestorPhone")} />
                {errors.requestorPhone && <p className="text-sm text-red-600">{errors.requestorPhone.message}</p>}
              </div>

              <Button type="submit" loading={isSubmitting}>
                {!isSubmitting && <FolderPlus className="h-4 w-4" />} Submit Request
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {result && (
            <Alert variant="success">
              <AlertTitle>Request received</AlertTitle>
              <AlertDescription>
                <p>{result.message}</p>
                <p className="mt-2 text-xs opacity-80">Reference: {result.id}</p>
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Status tracking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                You can track the status of your request from the admin panel once approved — your reference ID is shown above.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}
