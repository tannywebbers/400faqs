import { startModerationWorker } from "./moderation.worker";
import { startGameWorker } from "./game.worker";
import { startNotificationWorker } from "./notification.worker";
import { startAnalyticsWorker } from "./analytics.worker";
import { connectRedis } from "../lib/redis";
import { logger } from "../lib/logger";

export function startWorkers(): void {
  startModerationWorker();
  startGameWorker();
  startNotificationWorker();
  startAnalyticsWorker();
  logger.info("[workers] all workers started");
}

async function main() {
  await connectRedis();
  startWorkers();
  logger.info("[worker] standalone worker process running");
}

if (require.main === module) {
  main().catch((err) => {
    logger.error("[worker] failed to start", (err as Error).message);
    process.exit(1);
  });
}
