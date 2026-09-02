import http from "http";
import { createApp } from "./app";
import { config, requireEnv } from "./config";
import { connectRedis, closeRedis } from "./lib/redis";
import { initSocket } from "./sockets";
import { startWorkers } from "./workers";
import { prisma } from "./lib/prisma";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { enqueue } from "./lib/queue";
import { withLock } from "./lib/lock";

// Every scheduled task runs through a distributed lock and an isolated
// try/catch so duplicate instances or a failed run can never double-fire
// or crash the process.
async function guardedCron(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    const result = await withLock(`cron:${name}`, 10 * 60, fn);
    if (result === null) {
      logger.debug(`[cron] ${name} skipped (lock held)`);
    }
  } catch (err) {
    logger.warn(`[cron] ${name} failed`, (err as Error).message);
  }
}

async function main() {
  requireEnv();

  // Redis powers background workers/queues, distributed locks and caching.
  // A failed/unreachable Redis must NEVER take the whole API down (that turns
  // a hosted-Redis blip into "application error" on every request). When it
  // cannot connect we boot in DEGRADED MODE: workers/queues stay off and cache
  // calls fall back to an in-process store (see lib/redis.ts). Set a reachable
  // REDIS_URL and redeploy to restore full mode.
  let redisUp = false;
  try {
    await connectRedis();
    redisUp = true;
  } catch (err) {
    const message = (err as Error).message;
    logger.error("[redis] " + message);
    logger.error(
      "[api] STARTING IN DEGRADED MODE: Redis unreachable - background workers, queues, distributed locks and Redis caching are DISABLED. Set a reachable REDIS_URL (e.g. Upstash) and restart to restore full mode."
    );
  }

  const app = createApp();
  const server = http.createServer(app);

  initSocket(server);

  // Workers require a live Redis connection; never start them on a dead one.
  const workersEnabled = redisUp && (config.env === "production" || process.env.WORKER_PROCESS !== "0");
  if (workersEnabled) {
    startWorkers();
  } else if (config.env !== "production" && redisUp && process.env.WORKER_PROCESS === "0") {
    logger.info("[api] WORKER_PROCESS=0 → running API server only (no in-process workers)");
  }

  // Cron: sweep stale sessions every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    guardedCron("session-sweep", async () => {
      const sessions = await prisma.session.findMany({ where: { status: { in: ["WAITING", "ACTIVE"] } }, select: { id: true } });
      for (const s of sessions) {
        await enqueue("game", "sweep", { sessionId: s.id }, { attempts: 1 });
      }
    });
  });

  // Cron: reliability recovery sweep every 5 minutes — reconciles stale
  // monetization gates, stuck notification rows and sessions that
  // slipped past the per-session worker sweep.
  cron.schedule("*/5 * * * *", () => {
    guardedCron("recovery", async () => {
      const { recoverMonetization, recoverStuckNotifications, recoverStuckSessions } = await import("./services/recovery.js");
      const [monetization, notifications, sessions] = await Promise.all([
        recoverMonetization(),
        recoverStuckNotifications(),
        recoverStuckSessions(),
      ]);
      if (monetization.expired + monetization.cancelled + notifications + sessions > 0) {
        logger.info("[cron] recovery sweep", { monetization, notifications, sessions });
      }
    });
  });

  // Cron: retention cleanup hourly + daily analytics snapshot at 00:15
  cron.schedule("0 * * * *", () => {
    guardedCron("retention-cleanup", async () => {
      const { runRetentionCleanup } = await import("./services/recovery.js");
      const { processedEvents, jobLogs } = await runRetentionCleanup();
      if (processedEvents + jobLogs > 0) logger.info("[cron] retention cleanup", { processedEvents, jobLogs });
    });
  });

  cron.schedule("15 0 * * *", () => {
    guardedCron("snapshot", async () => {
      await enqueue("snapshot", "capture", {}, { attempts: 1, jobId: "snapshot-daily" });
    });
  });

  // Cron: update deployment timestamp once at startup
  await prisma.setting.upsert({
    where: { key: "system.lastDeployment" },
    update: { value: new Date().toISOString() },
    create: { key: "system.lastDeployment", value: new Date().toISOString(), group: "system", type: "string" },
  });

  server.listen(config.port, () => {
    logger.info(`[api] listening on ${config.port} (${config.env})`);
  });

  const shutdown = async () => {
    logger.info("[api] shutting down...");
    server.close();
    await closeRedis();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error("[api] fatal startup error", (err as Error).message);
  process.exit(1);
});
