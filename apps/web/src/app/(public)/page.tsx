import { apiUrl } from "@/lib/api";

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  questionCount: number;
  playCount: number;
  trending: boolean;
  createdByName: string;
};

type Stats = {
  categories: number;
  questions: number;
  sessions: number;
  moves: number;
  contributions: number;
  players: number;
  approvedQuestions: number;
};

type FaqRow = { id: string; question: string; answer: string };

type StepItem = { step: string; title: string; desc: string };
type FeatureItem = { icon: string; title: string; desc: string };

function parseJson<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(apiUrl(path), { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const payload = (await res.json()) as { data: T };
    return payload.data;
  } catch {
    return null;
  }
}

const DEFAULT_STEPS: StepItem[] = [
  { step: "1", title: "Message us", desc: "Open WhatsApp and send START to our number." },
  { step: "2", title: "Create a session", desc: "Get a unique invite code instantly." },
  { step: "3", title: "Invite your friend", desc: "Share the code — they join instantly." },
  { step: "4", title: "Pick a category", desc: "Truth, Dare, or hundreds of themes." },
  { step: "5", title: "Play", desc: "Alternate turns. Answer. Have fun." },
];

const DEFAULT_FEATURES: FeatureItem[] = [
  { icon: "♾️", title: "Unlimited Sessions", desc: "Create as many games as you want, any time." },
  { icon: "🗂️", title: "Hundreds of Categories", desc: "New themes added by the community constantly." },
  { icon: "🤝", title: "Community Questions", desc: "Anyone can contribute a question — AI checks quality." },
  { icon: "💭", title: "Truth Tap", desc: "Dedicated truth questions for real conversations." },
  { icon: "🔥", title: "Dare Tap", desc: "Bold dares to keep things spicy." },
  { icon: "🎲", title: "Random Questions", desc: "Skip around, get fresh questions every turn." },
  { icon: "📜", title: "Session History", desc: "Full game history, questions asked and answered." },
  { icon: "🚩", title: "Question Reports", desc: "Flag bad questions and keep the library clean." },
  { icon: "✨", title: "AI Duplicate Detection", desc: "Smart checks keep the library fresh and unique." },
];

export const revalidate = 300;

export default async function HomePage() {
  const [settings, categories, stats, faqs] = await Promise.all([
    fetchJson<Record<string, string>>("/api/public/settings"),
    fetchJson<CategoryRow[]>("/api/public/categories?limit=6&sort=trending"),
    fetchJson<Stats>("/api/public/stats"),
    fetchJson<FaqRow[]>("/api/public/faqs"),
  ]);

  const siteName = settings?.["site.name"] ?? "400faqs";
  const tagline = settings?.["site.tagline"] ?? "The Ultimate WhatsApp Questions Game";
  const heroBadge = settings?.["site.hero.badge"] ?? "Play inside WhatsApp";
  const heroSubtitle = settings?.["site.hero.subtitle"] ?? "Two friends. One WhatsApp chat. Hundreds of questions.";
  const description =
    settings?.["site.description"] ??
    "Challenge your friends. Ask hundreds of questions. Play Truth or Dare. Discover new categories. Everything inside WhatsApp.";
  const waNumber = settings?.["whatsapp.number"] ?? "";
  const waLink = waNumber ? `https://wa.me/${waNumber.replace(/\D/g, "")}?text=${encodeURIComponent("START")}` : null;

  const howTitle = settings?.["landing.how.title"] ?? "How It Works";
  const howSubtitle =
    settings?.["landing.how.subtitle"] ?? "From zero to game in under a minute. No signup, no app install.";
  const steps = parseJson<StepItem[]>(settings?.["landing.how.steps"], DEFAULT_STEPS);

  const featuresTitle = settings?.["landing.features.title"] ?? "Everything You Need";
  const featuresSubtitle = settings?.["landing.features.subtitle"] ?? "A complete question game platform, built around WhatsApp.";
  const features = parseJson<FeatureItem[]>(settings?.["landing.features.items"], DEFAULT_FEATURES);

  const categoryTitle = settings?.["landing.categories.title"] ?? "Trending Categories";
  const categorySubtitle = settings?.["landing.categories.subtitle"] ?? "What the community is playing right now.";

  const faqTitle = settings?.["landing.faq.title"] ?? "Frequently Asked Questions";

  const ctaTitle = settings?.["landing.cta.title"] ?? "Ready to play?";
  const ctaBody = settings?.["landing.cta.body"] ?? description;

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-brand/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full bg-accent/20 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, #1F2937 1px, transparent 0)",
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        <div className="mx-auto flex max-w-7xl flex-col items-center px-4 pb-24 pt-20 text-center sm:px-6 lg:pt-28">
          <div className="animate-fade-in-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary-700">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              {heroBadge}
            </span>
          </div>

          <h1 className="mt-6 animate-fade-in-up text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl" style={{ animationDelay: "0.1s" }}>
            <span className="gradient-text">{siteName}</span>
          </h1>
          <p className="mt-4 animate-fade-in-up text-xl font-semibold text-ink sm:text-2xl" style={{ animationDelay: "0.2s" }}>
            {tagline}
          </p>
          <p className="mt-4 max-w-2xl animate-fade-in-up text-base text-muted-foreground sm:text-lg" style={{ animationDelay: "0.3s" }}>
            {heroSubtitle}
          </p>

          <div className="mt-8 flex flex-col gap-3 animate-fade-in-up sm:flex-row" style={{ animationDelay: "0.4s" }}>
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-brand px-6 text-base font-semibold text-white shadow-glass-lg transition-all hover:opacity-90 active:scale-[0.98]"
              >
                Start Playing on WhatsApp
              </a>
            )}
            <a
              href="/categories"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-white px-6 text-base font-semibold text-ink shadow-soft transition-all hover:bg-surface active:scale-[0.98]"
            >
              Browse Categories
            </a>
          </div>

          {/* Floating glass cards */}
          <div className="relative mt-16 hidden w-full max-w-4xl grid-cols-3 gap-4 md:grid">
            {[
              { title: "Truth or Dare", desc: "Classic dares & spicy truths", icon: "🎯", delay: "0s" },
              { title: "Hundreds of Questions", desc: `${stats?.questions ?? 0}+ live questions`, icon: "📚", delay: "0.5s" },
              { title: "No App Needed", desc: "Everything in WhatsApp", icon: "💬", delay: "1s" },
            ].map((card, i) => (
              <div
                key={card.title}
                className={`glass animate-float rounded-2xl p-5 ${i === 1 ? "mt-6" : ""}`}
                style={{ animationDelay: card.delay }}
              >
                <div className="text-2xl">{card.icon}</div>
                <p className="mt-2 font-semibold">{card.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= STATS ================= */}
      {stats && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="glass grid grid-cols-2 gap-6 rounded-3xl p-8 sm:grid-cols-4">
            {[
              { label: "Questions", value: stats.approvedQuestions },
              { label: "Categories", value: stats.categories },
              { label: "Games Played", value: stats.sessions },
              { label: "Players", value: stats.players },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-black gradient-text">{s.value.toLocaleString()}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ================= HOW IT WORKS ================= */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{howTitle}</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            {howSubtitle}
          </p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s) => (
            <div key={s.step} className="glass card-hover rounded-2xl p-6 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand font-bold text-white">
                {s.step}
              </div>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{featuresTitle}</h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              {featuresSubtitle}
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="glass card-hover rounded-2xl p-6">
                <div className="text-3xl">{f.icon}</div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= TRENDING CATEGORIES ================= */}
      {categories && categories.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">{categoryTitle}</h2>
              <p className="mt-2 text-muted-foreground">{categorySubtitle}</p>
            </div>
            <a href="/categories" className="text-sm font-semibold text-brand hover:underline">
              View all →
            </a>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <a key={c.id} href={`/categories/${c.slug}`} className="glass card-hover rounded-2xl p-6">
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-xl"
                    style={{ backgroundColor: `${c.color}18`, color: c.color }}
                  >
                    {c.icon.slice(0, 2) === "em" ? "🗂️" : c.icon}
                  </div>
                  {c.trending && (
                    <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-700">Trending</span>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{c.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                <p className="mt-3 text-xs font-medium text-muted-foreground">
                  {c.questionCount.toLocaleString()} questions · {c.playCount.toLocaleString()} plays
                </p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ================= FAQ ================= */}
      {faqs && faqs.length > 0 && (
        <section className="border-t border-line bg-white">
          <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight">{faqTitle}</h2>
              <a href="/help" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
                Visit Help Center →
              </a>
            </div>
            <FaqAccordion faqs={faqs} />
          </div>
        </section>
      )}

      {/* ================= CTA ================= */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-brand px-6 py-16 text-center text-white sm:px-16">
          <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">{ctaTitle}</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/80">{ctaBody}</p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-primary-700 shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
              >
                Start Playing on WhatsApp
              </a>
            )}
            <a
              href="/contribute"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 text-base font-semibold text-white backdrop-blur transition-all hover:bg-white/20 active:scale-[0.98]"
            >
              Contribute a Question
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

function FaqAccordion({ faqs }: { faqs: FaqRow[] }) {
  return (
    <div className="mt-10 divide-y divide-line rounded-2xl border border-line bg-white px-6 shadow-soft">
      {faqs.map((faq) => (
        <details key={faq.id} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
            {faq.question}
            <span className="ml-4 text-muted-foreground transition-transform group-open:rotate-45">＋</span>
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
        </details>
      ))}
    </div>
  );
}
