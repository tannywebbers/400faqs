import { createWorker } from "../lib/queue";
import { processCampaignBatch, startCampaign } from "../services/campaign";
import { logger } from "../lib/logger";

export function startCampaignWorker(): void {
  createWorker("campaign", async (job) => {
    const data = job.data as { campaignId?: string } | undefined;
    if (!data?.campaignId) return;

    try {
      if (job.name === "start") {
        await startCampaign(data.campaignId);
      } else if (job.name === "dispatch") {
        await processCampaignBatch(data.campaignId);
      }
    } catch (err) {
      logger.warn("[worker:campaign] job failed", { job: job.name, error: (err as Error).message });
      throw err;
    }
  });
}