import Redis from "ioredis";
import { config } from "../config";
import { logger } from "./logger";

let client: Redis | null = null;
let connected = false;

export class RedisConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedisConnectionError";
  }
}

function maskedUrl(): string {
  try {
    const u = new URL(config.redis.url);
    u.password = u.password ? "***" : "";
    return u.toString();
  } catch {
    return "(invalid REDIS_URL)";
  }
}

function redisFixHint(cause?: string): string {
  return [
    `Cannot connect to Redis at ${maskedUrl()}.`,
    "Redis is required for background workers, queues, distributed locks and caching.",
    "",
    "Fix options:",
    "  1. Start local Redis (recommended):  docker compose up -d redis",
    "  2. Point REDIS_URL at a reachable Redis (hosted, e.g. Upstash, or local redis-server).",
    "  3. Development-only (NO background workers, NOT for production): set REDIS_REQUIRED=false",
    cause ? `  Underlying cause: ${cause}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildClient(): Redis {
  const r = new Redis(config.redis.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    reconnectOnError: () => true,
  });
  r.on("error", (err) => {
    // Avoid logging the initial-connect failure twice; the real message is
    // surfaced by connectRedis(). Runtime errors after a successful connect
    // are still reported.
    if (connected) logger.warn("[redis] error", err.message);
  });
  return r;
}

export function getRedis(): Redis {
  if (!client) client = buildClient();
  return client;
}

export function isRedisConnected(): boolean {
  return connected;
}

export async function connectRedis(): Promise<void> {
  if (connected) return;
  const r = getRedis();
  let timer: NodeJS.Timeout | undefined;
  try {
    const startupTimeoutMs = config.redis.startupTimeoutMs;
    const guard = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new RedisConnectionError(`Redis connection timed out after ${startupTimeoutMs}ms at ${maskedUrl()}.`)),
        startupTimeoutMs,
      );
    });
    await Promise.race([r.connect(), guard]);
    connected = true;
    logger.info("[redis] connected");
  } catch (err) {
    // ioredis rejects `connect()` with the cryptic "Connection is closed."
    // when the target socket fails. If our bounded timeout fired first, use that
    // message; otherwise translate the raw error into an actionable hint.
    const cause = (err as Error).message === "Connection is closed." ? "connection refused / socket closed (is Redis running?)" : (err as Error).message;
    throw new RedisConnectionError(redisFixHint(cause));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const r = getRedis();
    if (r.status === "wait") await r.connect();
    const res = await r.ping();
    return res === "PONG";
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    connected = false;
  }
}

export const cacheKeys = {
  publicSettings: "cache:public:settings",
  publicCategories: "cache:public:categories",
  publicFaqs: "cache:public:faqs",
  publicArticles: "cache:public:articles",
  stats: "cache:public:stats",
};

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* noop */
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch {
    /* noop */
  }
}
