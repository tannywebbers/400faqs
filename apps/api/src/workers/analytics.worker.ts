import { createWorker } from "../lib/queue";
import { captureAnalyticsSnapshot } from "../services/snapshot";

export function startAnalyticsWorker(): void {
  createWorker("snapshot", async (job) => {
    if (job.name !== "capture") return;
    await captureAnalyticsSnapshot(Boolean((job.data as { force?: boolean } | undefined)?.force));
  });
}