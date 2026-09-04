"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Mail, MessageCircle, HelpCircle } from "lucide-react";
import Link from "next/link";
import { submitContact } from "@/lib/queries/public-client";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePublicSettings } from "@/hooks/use-public-settings";

const schema = z.object({
  name: z.string().min(1, "Your name is required").max(100),
  email: z.string().email("Enter a valid email"),
  subject: z.string().min(3).max(200),
  message: z.string().min(10, "Message must be at least 10 characters").max(3000),
});

type FormValues = z.infer<typeof schema>;

export default function ContactPage() {
  const { data: settings } = usePublicSettings();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const waNumber = settings?.["whatsapp.number"] ?? "";
  const supportEmail = settings?.["contact.email"] ?? "";

  const onSubmit = async (values: FormValues) => {
    try {
      await submitContact(values);
      toast.success("Message sent! We'll get back to you soon.");
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    }
  };

  return (
    <Container className="py-10">
      <PageHeader title="Contact Us" description="Questions, feedback or issues? We're here to help." />

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Send us a message</CardTitle>
            <CardDescription>We typically respond within 24 hours.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" placeholder="Your name" {...register("name")} />
                  {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" {...register("email")} />
                  {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" placeholder="What is this about?" {...register("subject")} />
                {errors.subject && <p className="text-sm text-red-600">{errors.subject.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" rows={6} placeholder="Tell us more..." {...register("message")} />
                {errors.message && <p className="text-sm text-red-600">{errors.message.message}</p>}
              </div>
              <Button type="submit" loading={isSubmitting}>
                Send Message
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Direct contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {supportEmail && (
                <a href={`mailto:${supportEmail}`} className="flex items-center gap-3 text-sm font-medium text-ink hover:text-brand">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Mail className="h-5 w-5" />
                  </span>
                  {supportEmail}
                </a>
              )}
              {waNumber && (
                <a
                  href={`https://wa.me/${waNumber.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 text-sm font-medium text-ink hover:text-brand"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  WhatsApp support
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-brand" /> Quick help
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/help" className="text-sm font-semibold text-brand hover:underline">
                Visit Help Center →
              </Link>
              <p className="mt-2 text-sm text-muted-foreground">Most questions are answered in our guides.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}
