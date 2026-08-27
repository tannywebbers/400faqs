import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  port: int(process.env.PORT, 4000),
  apiUrl: process.env.API_URL ?? `http://localhost:${int(process.env.PORT, 4000)}`,
  webUrl: process.env.WEB_URL ?? "http://localhost:3000",

  databaseUrl: process.env.DATABASE_URL ?? "",

  redis: {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? "change-me-in-production",
    expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  },

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "400ques-verify",
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? "v19.0",
    apiBase: process.env.WHATSAPP_API_BASE ?? "https://graph.facebook.com",
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  },

  googleAi: {
    apiKey: process.env.GOOGLE_AI_API_KEY ?? "",
    model: process.env.GOOGLE_AI_MODEL ?? "gemini-2.0-flash",
    endpoint: process.env.GOOGLE_AI_ENDPOINT ?? "https://generativelanguage.googleapis.com/v1beta",
    timeoutMs: int(process.env.GOOGLE_AI_TIMEOUT_MS, 15000),
  },

  uploads: {
    dir: path.resolve(process.cwd(), "uploads"),
    publicUrl: process.env.UPLOADS_PUBLIC_URL ?? "/uploads",
  },

  admin: {
    email: process.env.ADMIN_EMAIL ?? "admin@400ques.com",
    password: process.env.ADMIN_PASSWORD ?? "admin1234",
    name: process.env.ADMIN_NAME ?? "Super Admin",
  },

  rateLimits: {
    public: int(process.env.RATE_LIMIT_PUBLIC, 60),
    auth: int(process.env.RATE_LIMIT_AUTH, 10),
  },

  maintenanceMode: bool(process.env.MAINTENANCE_MODE),

  deployment: {
    version: process.env.npm_package_version ?? "1.0.0",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? "",
    deployedAt: new Date().toISOString(),
    platform: process.env.VERCEL ? "vercel" : process.env.RENDER ? "render" : process.env.RAILWAY ? "railway" : process.env.FLY ? "fly" : "self-hosted",
  },
} as const;

export function requireEnv(): void {
  const missing: string[] = [];
  if (!config.jwt.secret || config.jwt.secret === "change-me-in-production") missing.push("JWT_SECRET");
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (missing.length) {
    console.warn(`[config] Missing required env vars: ${missing.join(", ")}`);
  }
}
