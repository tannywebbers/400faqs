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

  await connectRedis();

  const app = createApp();
  const server = http.createServer(app);

  initSocket(server);

  // Workers run only in the main process (set WORKER_PROCESS=0 to disable)
  if (config.env === "production" || process.env.WORKER_PROCESS !== "0") {
    startWorkers();
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

  // Cron: promote due scheduled campaigns every minute
  cron.schedule("* * * * *", () => {
    guardedCron("campaign-advance", async () => {
      const { advanceDueCampaigns } = await import("./services/campaign");
      const due = await advanceDueCampaigns();
      if (due > 0) logger.info("[cron] advanced due campaigns", { count: due });
    });
  });

  // Cron: reliability recovery sweep every 5 minutes — reconciles stale
  // monetization gates, stuck notification/delivery rows and sessions that
  // slipped past the per-session worker sweep.
  cron.schedule("*/5 * * * *", () => {
    guardedCron("recovery", async () => {
      const { recoverMonetization, recoverStuckNotifications, recoverStuckCampaignDeliveries, recoverStuckSessions } = await import("./services/recovery");
      const [monetization, notifications, deliveries, sessions] = await Promise.all([
        recoverMonetization(),
        recoverStuckNotifications(),
        recoverStuckCampaignDeliveries(),
        recoverStuckSessions(),
      ]);
      if (monetization.expired + monetization.cancelled + notifications + deliveries + sessions > 0) {
        logger.info("[cron] recovery sweep", { monetization, notifications, deliveries, sessions });
      }
    });
  });

  // Cron: ensure a broadcast chain exists whenever WhatsApp notifications are
  // still queued but no worker picked them up (e.g. restart lost the chain).
  cron.schedule("*/5 * * * *", () => {
    guardedCron("broadcast-resume", async () => {
      const pending = await prisma.notification.count({ where: { channel: "WHATSAPP", status: { in: ["PENDING", "SENDING"] } } });
      if (pending > 0) {
        await enqueue("notification", "broadcast", {}, { attempts: 1, jobId: "broadcast-chain" });
      }
    });
  });

  // Cron: retention cleanup hourly + daily analytics snapshot at 00:15
  cron.schedule("0 * * * *", () => {
    guardedCron("retention-cleanup", async () => {
      const { runRetentionCleanup } = await import("./services/recovery");
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
