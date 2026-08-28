import crypto from "crypto";
import { getRedis } from "./redis";

// ============================================================
// Distributed lock — prevents concurrent execution of scheduled
// jobs across multiple API instances. Returns null when the lock
// is already held (caller decides whether to skip).
// ============================================================

export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
  retryMs = 0
): Promise<T | null> {
  const redis = getRedis();
  const token = crypto.randomBytes(16).toString("hex");
  const lockKey = `lock:${key}`;

  let acquired = await redis.set(lockKey, token, "EX", ttlSeconds, "NX");
  if (acquired !== "OK" && retryMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, retryMs));
    acquired = await redis.set(lockKey, token, "EX", ttlSeconds, "NX");
  }
  if (acquired !== "OK") return null;

  try {
    return await fn();
  } finally {
    try {
      const current = await redis.get(lockKey);
      if (current === token) {
        await redis.del(lockKey).catch(() => undefined);
      }
    } catch {
      /* lock may expire on its own */
    }
  }
}