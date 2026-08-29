import Redis from "ioredis";
import { config } from "../config";
import { logger } from "./logger";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(config.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    client.on("error", (err) => logger.warn("[redis] error", err.message));
  }
  return client;
}

let connected = false;

export async function connectRedis(): Promise<void> {
  if (connected) return;
  const r = getRedis();
  await r.connect();
  connected = true;
  logger.info("[redis] connected");
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
