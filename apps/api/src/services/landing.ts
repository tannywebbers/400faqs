import { prisma } from "../lib/prisma";
import { cacheGet, cacheSet, cacheDel } from "../lib/redis";

export const LANDING_CACHE_KEY = "cache:public:landing";

export type LandingRow = {
  id: string;
  sectionKey: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  imageUrl: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  isVisible: boolean;
  sortOrder: number;
  metadata: unknown;
};

type DefaultSection = {
  sectionKey: string;
  title: string | null;
  subtitle: string | null;
  content: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  sortOrder: number;
};

// Default sections for 400faqs. `content` is plain text for hero/cta and a JSON
// stringified array for stats/how_it_works/features/categories/faqs/legal.
const DEFAULT_SECTIONS: DefaultSection[] = [
  {
    sectionKey: "hero",
    title: "400faqs",
    subtitle: "Play inside WhatsApp",
    content:
      "The Ultimate WhatsApp Questions Game. Two friends. One WhatsApp chat. Hundreds of questions. Truth or Dare, categories, and community questions - all inside WhatsApp with no app install.",
    buttonText: "Start Playing on WhatsApp",
    buttonUrl: "",
    sortOrder: 0,
  },
  {
    sectionKey: "stats",
    title: "The 400faqs Community",
    subtitle: "Live numbers from our WhatsApp players",
    content: JSON.stringify([
      { key: "questions", label: "Verified Questions" },
      { key: "categories", label: "Categories" },
      { key: "games", label: "Games Played" },
      { key: "players", label: "Players" },
    ]),
    buttonText: null,
    buttonUrl: null,
    sortOrder: 1,
  },
  {
    sectionKey: "how_it_works",
    title: "How It Works",
    subtitle: "From zero to game in under a minute. No signup, no app install.",
    content: JSON.stringify([
      { title: "Message us", description: "Open WhatsApp and send START to our number." },
      { title: "Create a session", description: "Get a unique invite code instantly." },
      { title: "Invite your friend", description: "Share the code - they join instantly." },
      { title: "Pick a category", description: "Truth, Dare, or hundreds of themes." },
      { title: "Play", description: "Alternate turns. Ask. Answer. Have fun." },
    ]),
    buttonText: null,
    buttonUrl: null,
    sortOrder: 2,
  },
  {
    sectionKey: "features",
    title: "Everything You Need",
    subtitle: "A complete question game platform, built around WhatsApp.",
    content: JSON.stringify([
      { icon: "♾️", title: "Unlimited Sessions", description: "Create as many games as you want, any time." },
      { icon: "🗂️", title: "Hundreds of Categories", description: "New themes added by the community constantly." },
      { icon: "🤝", title: "Community Questions", description: "Anyone can contribute a question - AI checks quality." },
      { icon: "💭", title: "Truth Tap", description: "Dedicated truth questions for real conversations." },
      { icon: "🔥", title: "Dare Tap", description: "Bold dares to keep things spicy." },
      { icon: "🎲", title: "Random Questions", description: "Skip around, get fresh questions every turn." },
      { icon: "📜", title: "Session History", description: "Full game history, questions asked and answered." },
      { icon: "✨", title: "AI Quality Checks", description: "Smart checks keep the library fresh and unique." },
    ]),
    buttonText: null,
    buttonUrl: null,
    sortOrder: 3,
  },
  {
    sectionKey: "categories",
    title: "Trending Categories",
    subtitle: "What the community is playing right now.",
    content: null,
    buttonText: null,
    buttonUrl: null,
    sortOrder: 4,
  },
  {
    sectionKey: "faqs",
    title: "Frequently Asked Questions",
    subtitle: "Answers to the questions players ask the most.",
    content: null,
    buttonText: null,
    buttonUrl: null,
    sortOrder: 5,
  },
  {
    sectionKey: "cta",
    title: "Ready to play?",
    subtitle: "Two friends. One WhatsApp chat. Hundreds of questions.",
    content:
      "Challenge your friends. Ask hundreds of questions. Play Truth or Dare. Discover new categories. Everything inside WhatsApp.",
    buttonText: "Start Playing on WhatsApp",
    buttonUrl: "",
    sortOrder: 6,
  },
  {
    sectionKey: "privacy_policy",
    title: "Privacy Policy",
    subtitle: null,
    content: JSON.stringify([
      {
        heading: "Information We Collect",
        body: "We collect only the information needed to provide the 400faqs game: your WhatsApp phone number, game sessions, and any questions you contribute.",
      },
      {
        heading: "How We Use Your Data",
        body: "Your data is used to run the game, verify community questions, send you game updates, and improve the service. We never sell personal data.",
      },
      {
        heading: "Third-Party Services",
        body: "We use trusted service providers (hosting, databases, and messaging infrastructure) to operate 400faqs. They process data only on our behalf.",
      },
    ]),
    buttonText: null,
    buttonUrl: null,
    sortOrder: 7,
  },
  {
    sectionKey: "terms_of_service",
    title: "Terms of Service",
    subtitle: null,
    content: JSON.stringify([
      {
        heading: "Acceptance of Terms",
        body: "By using 400faqs you agree to these terms. The game is provided as-is for personal, non-commercial entertainment.",
      },
      {
        heading: "Community Content",
        body: "You retain ownership of questions you contribute, and grant 400faqs a license to display, review, and moderate them. Keep contributions respectful and age-appropriate.",
      },
      {
        heading: "Acceptable Use",
        body: "Do not abuse, spam, harass, or attempt to harm the service or other players. We may remove content or restrict access that violates these rules.",
      },
    ]),
    buttonText: null,
    buttonUrl: null,
    sortOrder: 8,
  },
  {
    sectionKey: "cookies_policy",
    title: "Cookies Policy",
    subtitle: null,
    content: JSON.stringify([
      {
        heading: "What Cookies We Use",
        body: "400faqs uses essential cookies and local storage to keep you signed in and remember preferences. These are required for the site to function.",
      },
      {
        heading: "Managing Cookies",
        body: "You can clear site data in your browser at any time. Disabling essential cookies may affect how the site works.",
      },
      {
        heading: "Third-Party Cookies",
        body: "Advertising and analytics partners may set their own cookies. Their use is governed by their own policies.",
      },
    ]),
    buttonText: null,
    buttonUrl: null,
    sortOrder: 9,
  },
];

// Seed any missing default section rows. Idempotent: rows that already exist
// (or were intentionally deleted) are left alone.
export async function ensureLandingSections() {
  const existing = await prisma.landingContent.findMany({ select: { sectionKey: true } });
  const existingKeys = new Set(existing.map((e) => e.sectionKey));
  const missing = DEFAULT_SECTIONS.filter((d) => !existingKeys.has(d.sectionKey));
  if (missing.length === 0) return;
  await prisma.landingContent.createMany({
    data: missing.map((d) => ({
      sectionKey: d.sectionKey,
      title: d.title,
      subtitle: d.subtitle,
      content: d.content,
      buttonText: d.buttonText,
      buttonUrl: d.buttonUrl,
      isVisible: true,
      sortOrder: d.sortOrder,
    })),
    skipDuplicates: true,
  });
}

// Public landing page content: only visible sections, ordered.
export async function getPublicLanding(): Promise<LandingRow[]> {
  const cached = await cacheGet<LandingRow[]>(LANDING_CACHE_KEY);
  if (cached) return cached;
  await ensureLandingSections();
  const rows = await prisma.landingContent.findMany({
    where: { isVisible: true },
    orderBy: { sortOrder: "asc" },
  });
  const data = rows.map((r) => ({
    id: r.id,
    sectionKey: r.sectionKey,
    title: r.title,
    subtitle: r.subtitle,
    content: r.content,
    imageUrl: r.imageUrl,
    buttonText: r.buttonText,
    buttonUrl: r.buttonUrl,
    isVisible: r.isVisible,
    sortOrder: r.sortOrder,
    metadata: r.metadata,
  }));
  await cacheSet(LANDING_CACHE_KEY, data, 300);
  return data;
}

// Admin list: all rows (including hidden), ordered.
export async function getAdminLanding(): Promise<LandingRow[]> {
  await ensureLandingSections();
  const rows = await prisma.landingContent.findMany({ orderBy: { sortOrder: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    sectionKey: r.sectionKey,
    title: r.title,
    subtitle: r.subtitle,
    content: r.content,
    imageUrl: r.imageUrl,
    buttonText: r.buttonText,
    buttonUrl: r.buttonUrl,
    isVisible: r.isVisible,
    sortOrder: r.sortOrder,
    metadata: r.metadata,
  }));
}

export async function invalidateLandingCache() {
  await cacheDel(LANDING_CACHE_KEY);
}