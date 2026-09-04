import {
  getPublicSettings,
  getPublicLanding,
  getPublicStats,
  getPublicFaqs,
  getTrendingCategories,
  type PublicSettings,
  type LandingSection,
  type PublicStats,
  type FaqRow,
  type CategorySummary,
} from "@/lib/queries/public-server";

type CategoryRow = CategorySummary;
type Stats = PublicStats;

type StepItem = { step?: string; title: string; desc?: string; description?: string };
type FeatureItem = { icon?: string; title: string; desc?: string; description?: string };
type StatItem = { key?: string; value?: string; label: string };

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeSteps(items: StepItem[]): StepItem[] {
  return items.map((it, i) => ({
    step: it.step ?? String(i + 1),
    title: it.title,
    desc: it.desc ?? it.description ?? "",
  }));
}

function normalizeFeatures(items: FeatureItem[]): FeatureItem[] {
  return items.map((it) => ({ icon: it.icon || "✨", title: it.title, desc: it.desc ?? it.description ?? "" }));
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

const STAT_KEYS: Record<string, keyof Stats> = {
  questions: "approvedQuestions",
  categories: "categories",
  games: "sessions",
  players: "players",
};

function statValue(stats: Stats | null, key: string): number {
  const mapKey = STAT_KEYS[key] ?? key;
  if (!stats) return 0;
  return typeof stats[mapKey] === "number" ? stats[mapKey] : 0;
}

// Sections rendered on the home page (in live order). Legal pages have their
// own routes and are intentionally excluded here.
const HOME_SECTION_KEYS = ["hero", "stats", "how_it_works", "features", "categories", "faqs", "cta"];

export const revalidate = 60;

export default async function HomePage() {
  const [settings, categories, stats, faqs, landing] = await Promise.all([
    getPublicSettings().catch(() => null),
    getTrendingCategories(6).catch(() => null),
    getPublicStats().catch(() => null),
    getPublicFaqs().catch(() => null),
    getPublicLanding().catch(() => null),
  ]);

  const waNumber = settings?.["whatsapp.number"] ?? "";
  const waLink = waNumber ? `https://wa.me/${waNumber.replace(/\D/g, "")}?text=${encodeURIComponent("START")}` : null;

  const find = (key: string) => landing?.find((s) => s.sectionKey === key);

  const hero = find("hero");
  const statsSection = find("stats");
  const how = find("how_it_works");
  const features = find("features");
  const categoriesSection = find("categories");
  const faqSection = find("faqs");
  const cta = find("cta");

  const heroTitle = hero?.title ?? settings?.["site.name"] ?? "400faqs";
  const heroBadge = hero?.subtitle ?? settings?.["site.hero.badge"] ?? "Play inside WhatsApp";
  const heroSubtitle =
    hero?.content ??
    settings?.["site.hero.subtitle"] ??
    "Two friends. One WhatsApp chat. Hundreds of questions.";
  const heroButtonText = hero?.buttonText ?? "Start Playing on WhatsApp";
  const heroButtonUrl = hero?.buttonUrl ?? waLink;

  const howTitle = how?.title ?? "How It Works";
  const howSubtitle = how?.subtitle ?? "From zero to game in under a minute. No signup, no app install.";
  const steps = normalizeSteps(
    how ? parseJson<StepItem[]>(how.content, DEFAULT_STEPS) : parseJson(settings?.["landing.how.steps"], DEFAULT_STEPS)
  );

  const featuresTitle = features?.title ?? "Everything You Need";
  const featuresSubtitle = features?.subtitle ?? "A complete question game platform, built around WhatsApp.";
  const featureItems = normalizeFeatures(
    features ? parseJson<FeatureItem[]>(features.content, DEFAULT_FEATURES) : parseJson(settings?.["landing.features.items"], DEFAULT_FEATURES)
  );

  const categoryTitle = categoriesSection?.title ?? "Trending Categories";
  const categorySubtitle = categoriesSection?.subtitle ?? "What the community is playing right now.";

  const faqTitle = faqSection?.title ?? "Frequently Asked Questions";

  const ctaTitle = cta?.title ?? "Ready to play?";
  const ctaBody = cta?.content ?? settings?.["site.description"] ?? "";

  const ctaButtonText = cta?.buttonText ?? "Start Playing on WhatsApp";
  const ctaButtonUrl = cta?.buttonUrl ?? waLink;

  const statItems: StatItem[] =
    statsSection && statsSection.content
      ? parseJson<StatItem[]>(statsSection.content, [{ key: "questions", label: "Questions" }])
      : [
          { key: "questions", label: "Questions" },
          { key: "categories", label: "Categories" },
          { key: "games", label: "Games Played" },
          { key: "players", label: "Players" },
        ];

  return (
    <>
      {homeSections(landing).map((section) => {
        switch (section.sectionKey) {
          case "hero":
            return (
              <HeroSection
                key={section.id}
                badge={heroBadge}
                title={heroTitle}
                subtitle={heroSubtitle}
                buttonText={section.buttonText ?? heroButtonText}
                buttonUrl={section.buttonUrl ?? heroButtonUrl}
                stats={stats}
              />
            );
          case "stats":
            return <StatsSection key={section.id} items={statItems} stats={stats} />;
          case "how_it_works":
            return <HowItWorksSection key={section.id} title={howTitle} subtitle={howSubtitle} steps={steps} />;
          case "features":
            return <FeaturesSection key={section.id} title={featuresTitle} subtitle={featuresSubtitle} items={featureItems} />;
          case "categories":
            return categories && categories.length > 0 ? (
              <CategoriesSection key={section.id} title={categoryTitle} subtitle={categorySubtitle} categories={categories} />
            ) : null;
          case "faqs":
            return faqs && faqs.length > 0 ? <FaqSection key={section.id} title={faqTitle} faqs={faqs} /> : null;
          case "cta":
            return (
              <CtaSection
                key={section.id}
                title={ctaTitle}
                body={ctaBody}
                buttonText={section.buttonText ?? ctaButtonText}
                buttonUrl={section.buttonUrl ?? ctaButtonUrl}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function homeSections(landing: LandingSection[] | null | undefined): LandingSection[] {
  if (!landing) {
    return []; // absent API → no landing-driven blocks; hard fallbacks per-section handle it
  }
  return landing.filter((s) => HOME_SECTION_KEYS.includes(s.sectionKey) && s.isVisible);
}

/* ================= HERO ================= */

function HeroSection({
  badge,
  title,
  subtitle,
  buttonText,
  buttonUrl,
  stats,
}: {
  badge: string;
  title: string;
  subtitle: string;
  buttonText: string;
  buttonUrl: string | null;
  stats: Stats | null;
}) {
  return (
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
            {badge}
          </span>
        </div>

        <h1 className="mt-6 animate-fade-in-up text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl" style={{ animationDelay: "0.1s" }}>
          <span className="gradient-text">{title}</span>
        </h1>
        <p className="mt-4 animate-fade-in-up text-xl font-semibold text-ink sm:text-2xl" style={{ animationDelay: "0.2s" }}>
          {subtitle}
        </p>

        <div className="mt-8 flex flex-col gap-3 animate-fade-in-up sm:flex-row" style={{ animationDelay: "0.4s" }}>
          {buttonUrl && (
            <a
              href={buttonUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-brand px-6 text-base font-semibold text-white shadow-glass-lg transition-all hover:opacity-90 active:scale-[0.98]"
            >
              {buttonText}
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
  );
}

/* ================= STATS ================= */

function StatsSection({ items, stats }: { items: StatItem[]; stats: Stats | null }) {
  if (!stats || items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="glass grid grid-cols-2 gap-6 rounded-3xl p-8 sm:grid-cols-4">
        {items.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-3xl font-black gradient-text">{statValue(stats, s.key ?? s.value ?? s.label).toLocaleString()}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ================= HOW IT WORKS ================= */

function HowItWorksSection({ title, subtitle, steps }: { title: string; subtitle: string; steps: StepItem[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{subtitle}</p>
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
  );
}

/* ================= FEATURES ================= */

function FeaturesSection({ title, subtitle, items }: { title: string; subtitle: string; items: FeatureItem[] }) {
  return (
    <section className="border-y border-line bg-white">
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{subtitle}</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <div key={f.title} className="glass card-hover rounded-2xl p-6">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= TRENDING CATEGORIES ================= */

function CategoriesSection({ title, subtitle, categories }: { title: string; subtitle: string; categories: CategoryRow[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
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
  );
}

/* ================= FAQ ================= */

function FaqSection({ title, faqs }: { title: string; faqs: FaqRow[] }) {
  return (
    <section className="border-t border-line bg-white">
      <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">{title}</h2>
          <a href="/help" className="mt-3 inline-block text-sm font-semibold text-brand hover:underline">
            Visit Help Center →
          </a>
        </div>
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
      </div>
    </section>
  );
}

/* ================= CTA ================= */

function CtaSection({ title, body, buttonText, buttonUrl }: { title: string; body: string; buttonText: string; buttonUrl: string | null }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-brand px-6 py-16 text-center text-white sm:px-16">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        {body && <p className="relative mx-auto mt-3 max-w-xl text-white/80">{body}</p>}
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {buttonUrl && (
            <a
              href={buttonUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-primary-700 shadow-lg transition-all hover:opacity-90 active:scale-[0.98]"
            >
              {buttonText}
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
  );
}