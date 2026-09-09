import type { Metadata } from "next";
import { getPublicSettings, getPublicStats } from "@/lib/queries/public-server";
import { Container } from "@/components/layout/container";
import { Heart, Eye, Users, Award, Star } from "lucide-react";

type Stats = { questions: number; categories: number; sessions: number; players: number; contributions: number };

async function fetchData() {
  const [settings, stats] = await Promise.all([
    getPublicSettings().catch(() => ({} as Record<string, string>)),
    getPublicStats().catch(() => null),
  ]);
  return { settings, stats };
}

export const metadata: Metadata = { title: "About", description: "Learn about 400faqs and the community behind it." };

export default async function AboutPage() {
  const { settings, stats } = await fetchData();
  const mission = settings["about.mission"] ?? "Make friends and strangers connect through playful questions, all inside WhatsApp.";
  const vision = settings["about.vision"] ?? "A world where every WhatsApp chat can become a fun, engaging game in seconds.";

  return (
    <Container className="py-10">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand text-2xl font-black text-white">4Q</div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">{settings["site.name"] ?? "400faqs"}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{settings["site.tagline"] ?? "The Ultimate WhatsApp Questions Game"}</p>
      </div>

      <div className="mt-16 grid gap-6 md:grid-cols-2">
        <div className="glass rounded-3xl p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Heart className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Our Mission</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">{mission}</p>
        </div>
        <div className="glass rounded-3xl p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Eye className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-bold">Our Vision</h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">{vision}</p>
        </div>
      </div>

      {stats && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Star, label: "Questions", value: stats.questions, color: "text-accent-700 bg-accent/10" },
            { icon: Users, label: "Players", value: stats.players, color: "text-brand-700 bg-brand/10" },
            { icon: Award, label: "Contributions", value: stats.contributions, color: "text-primary-700 bg-primary/10" },
            { icon: Star, label: "Games Played", value: stats.sessions, color: "text-purple-700 bg-purple-100" },
          ].map((s) => (
            <div key={s.label} className="glass rounded-2xl p-6 text-center">
              <div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-xl ${s.color}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-2xl font-bold">{s.value.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-16 rounded-3xl border border-line bg-white p-10 text-center shadow-soft">
        <h2 className="text-2xl font-bold">Built for the community</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          400faqs is powered by its players. Every question, category and improvement comes from people like you.
        </p>
        <p className="mt-6 text-sm text-muted-foreground">
          Want to help? <a href="/contribute" className="font-semibold text-brand hover:underline">Contribute a question</a> or{" "}
          <a href="/request-category" className="font-semibold text-brand hover:underline">request a category</a>.
        </p>
      </div>
    </Container>
  );
}
