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
  cron.schedule("*/5 * * * *", async () => {
    try {
      const sessions = await prisma.session.findMany({ where: { status: { in: ["WAITING", "ACTIVE"] } }, select: { id: true } });
      for (const s of sessions) {
        await enqueue("game", "sweep", { sessionId: s.id }, { attempts: 1 });
      }
    } catch (err) {
      logger.warn("[cron] session sweep failed", (err as Error).message);
    }
  });

  // Cron: promote due scheduled campaigns every minute
  cron.schedule("* * * * *", async () => {
    try {
      const { advanceDueCampaigns } = await import("./services/campaign");
      const due = await advanceDueCampaigns();
      if (due > 0) logger.info("[cron] advanced due campaigns", { count: due });
    } catch (err) {
      logger.warn("[cron] campaign advance failed", (err as Error).message);
    }
  });

  // Cron: daily analytics snapshot at 00:15
  cron.schedule("15 0 * * *", async () => {
    try {
      await enqueue("snapshot", "capture", {}, { attempts: 1, jobId: "snapshot-daily" });
    } catch (err) {
      logger.warn("[cron] snapshot enqueue failed", (err as Error).message);
    }
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
