import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

type SettingInput = {
  key: string;
  value: string;
  type: string;
  group: string;
  description?: string;
  public?: boolean;
};

const DEFAULT_SETTINGS: SettingInput[] = [
  // ===== General / Site =====
  { key: "site.name", value: "400QUES", type: "string", group: "general", description: "Site / bot display name", public: true },
  { key: "site.tagline", value: "The Ultimate WhatsApp Questions Game", type: "string", group: "general", description: "Hero subheading", public: true },
  { key: "site.description", value: "Challenge your friends. Ask hundreds of questions. Play Truth or Dare. Discover new categories. Everything inside WhatsApp.", type: "textarea", group: "general", description: "Long description used on landing / about", public: true },
  { key: "site.logo", value: "", type: "string", group: "general", description: "Logo image URL (leave empty for text logo)", public: true },
  { key: "site.version", value: "1.0.0", type: "string", group: "general", description: "Displayed version", public: true },
  { key: "site.landing.headline", value: "400QUES", type: "string", group: "hero", description: "Hero headline", public: true },
  { key: "site.hero.badge", value: "Play inside WhatsApp", type: "string", group: "hero", description: "Small pill above headline", public: true },
  { key: "site.hero.subtitle", value: "Two friends. One WhatsApp chat. Hundreds of questions.", type: "string", group: "hero", description: "Hero supporting line", public: true },

  // ===== WhatsApp =====
  { key: "whatsapp.number", value: "", type: "string", group: "whatsapp", description: "WhatsApp Business number in E.164 format (e.g. 14155552671)", public: true },
  { key: "whatsapp.displayName", value: "400QUES Bot", type: "string", group: "whatsapp", description: "Display name shown in messages", public: true },
  { key: "whatsapp.greeting", value: "Hey {name}! Welcome to 400QUES. Send *new* to create a game, *join* to enter a game, or *help* for help.", type: "textarea", group: "whatsapp", description: "{name} is replaced with player name", public: true },

  // ===== Contact / Social =====
  { key: "contact.email", value: "", type: "string", group: "contact", description: "Support email address", public: true },
  { key: "contact.phone", value: "", type: "string", group: "contact", description: "Support phone number", public: true },
  { key: "contact.address", value: "", type: "string", group: "contact", description: "Business address", public: true },
  { key: "social.twitter", value: "", type: "string", group: "social", description: "Twitter / X profile URL", public: true },
  { key: "social.instagram", value: "", type: "string", group: "social", description: "Instagram profile URL", public: true },
  { key: "social.facebook", value: "", type: "string", group: "social", description: "Facebook page URL", public: true },
  { key: "social.youtube", value: "", type: "string", group: "social", description: "YouTube channel URL", public: true },
  { key: "social.tiktok", value: "", type: "string", group: "social", description: "TikTok profile URL", public: true },

  // ===== Contribution =====
  { key: "contribution.autoApprove", value: "false", type: "boolean", group: "contribution", description: "Auto-approve contributions that pass AI checks (otherwise Pending Review)", public: false },
  { key: "contribution.aiThreshold", value: "0.85", type: "number", group: "contribution", description: "Similarity score above this = exact-ish duplicate (reject)", public: false },
  { key: "contribution.similarThreshold", value: "0.6", type: "number", group: "contribution", description: "Similarity score above this = mark Pending Review", public: false },
  { key: "contribution.perDayLimit", value: "50", type: "number", group: "contribution", description: "Max contributions per phone per day", public: false },
  { key: "contribution.enabled", value: "true", type: "boolean", group: "contribution", description: "Enable question contributions", public: true },

  // ===== Uploads =====
  { key: "uploads.maxSizeMB", value: "5", type: "number", group: "uploads", description: "Max screenshot upload size in MB", public: true },
  { key: "uploads.allowedTypes", value: "image/png,image/jpeg,image/webp,image/gif", type: "string", group: "uploads", description: "Comma separated allowed MIME types", public: false },

  // ===== Game =====
  { key: "game.turnTimeoutMinutes", value: "5", type: "number", group: "game", description: "Abandon session if a player is silent this long", public: false },
  { key: "game.inviteExpiryMinutes", value: "60", type: "number", group: "game", description: "How long an invite stays valid", public: false },
  { key: "game.roundsPerPlayer", value: "5", type: "number", group: "game", description: "Rounds per player per session", public: false },

  // ===== Appearance =====
  { key: "appearance.primary", value: "#2ECC71", type: "color", group: "appearance", description: "Primary green", public: true },
  { key: "appearance.blue", value: "#2F80ED", type: "color", group: "appearance", description: "Primary blue", public: true },
  { key: "appearance.orange", value: "#F2994A", type: "color", group: "appearance", description: "Accent orange", public: true },

  // ===== SEO =====
  { key: "seo.defaultTitle", value: "400QUES - The Ultimate WhatsApp Questions Game", type: "string", group: "seo", description: "Default meta title", public: true },
  { key: "seo.defaultDescription", value: "Challenge your friends. Ask hundreds of questions. Play Truth or Dare inside WhatsApp. No app install needed.", type: "textarea", group: "seo", description: "Default meta description", public: true },
  { key: "seo.defaultOgImage", value: "", type: "string", group: "seo", description: "Default Open Graph image URL", public: true },

  // ===== Privacy =====
  { key: "privacy.lastUpdated", value: "", type: "string", group: "privacy", description: "Privacy policy last updated date", public: true },
  { key: "terms.lastUpdated", value: "", type: "string", group: "privacy", description: "Terms last updated date", public: true },
  { key: "privacy.content", value: "Privacy Policy\n\n1. Data we collect\nWe collect minimal information needed to run the service: your WhatsApp phone number, messages you send to our bot, contributed questions, and optional display names. We do not require account registration.\n\n2. How we use your data\nYour data is used to operate the game (sessions, questions, contributions), improve question quality, and respond to support requests.\n\n3. Sharing\nWe never sell your personal data. Data is shared only with service providers required to operate the platform (e.g. hosting, WhatsApp Cloud API).\n\n4. Content\nQuestion contributions and reports are processed by automated AI moderation. Content flagged by moderators or users may be reviewed by our team.\n\n5. Data retention\nWe retain session history and contributions to operate the service. You can request deletion of your personal data by contacting us.\n\n6. Contact\nFor privacy questions, reach out via our contact page.", type: "textarea", group: "privacy", description: "Privacy policy body (markdown-ish, plain text)", public: true },
  { key: "terms.content", value: "Terms of Service\n\n1. Acceptance\nBy using 400QUES you agree to these terms.\n\n2. The service\n400QUES is a WhatsApp-powered questions game. You interact through WhatsApp; no app install is required.\n\n3. User conduct\nYou agree not to spam, harass, or submit abusive or illegal content. Contributions are moderated automatically and by staff.\n\n4. Community content\nQuestions are contributed by the community. We do our best to moderate but are not responsible for user-generated content.\n\n5. Availability\nWe aim for high availability but do not guarantee uninterrupted service.\n\n6. Changes\nWe may update these terms. Continued use after changes constitutes acceptance.\n\n7. Contact\nQuestions about these terms: use our contact page.", type: "textarea", group: "privacy", description: "Terms body (markdown-ish, plain text)", public: true },
  { key: "about.mission", value: "Make friends and strangers connect through playful questions, all inside WhatsApp.", type: "textarea", group: "about", description: "About page - mission", public: true },
  { key: "about.vision", value: "A world where every WhatsApp chat can become a fun, engaging game in seconds.", type: "textarea", group: "about", description: "About page - vision", public: true },
];

const DEFAULT_BADGES = [
  { name: "First Question", slug: "first-question", description: "Contributed your first question", icon: "Award", color: "#2ECC71" },
  { name: "Prolific Contributor", slug: "prolific-contributor", description: "Contributed 50 questions", icon: "Sparkles", color: "#2F80ED" },
  { name: "Question Master", slug: "question-master", description: "Contributed 200 questions", icon: "Crown", color: "#F2994A" },
  { name: "Community Champion", slug: "community-champion", description: "50 approved questions", icon: "HeartHandshake", color: "#9B51E0" },
  { name: "Quality Guard", slug: "quality-guard", description: "Flagged 10 bad questions", icon: "ShieldCheck", color: "#EB5757" },
  { name: "Category Founder", slug: "category-founder", description: "Requested a category that was approved", icon: "FolderPlus", color: "#56CCF2" },
];

async function main() {
  // ---- Settings ----
  for (const s of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // ---- Bootstrap admin ----
  const email = (process.env.ADMIN_EMAIL ?? "admin@400ques.com").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";
  const name = process.env.ADMIN_NAME ?? "Super Admin";
  const hash = await bcrypt.hash(password, 12);
  await prisma.admin.upsert({
    where: { email },
    update: { password: hash, name },
    create: { email, password: hash, name, role: Role.SUPER_ADMIN },
  });

  // ---- Badges ----
  for (const b of DEFAULT_BADGES) {
    await prisma.badge.upsert({
      where: { slug: b.slug },
      update: {},
      create: b,
    });
  }

  // ---- Initial system status event ----
  await prisma.systemEvent.create({
    data: { component: "server", status: "operational", message: "System initialized" },
  });

  console.log("Seed complete.");
  console.log(`  Admin:  ${email}`);
  console.log(`  Change the password after first login.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
