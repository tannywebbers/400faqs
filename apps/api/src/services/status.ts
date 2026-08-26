import { prisma } from "../lib/prisma";
import { pingRedis } from "../lib/redis";
import { whatsappConfigured } from "../lib/whatsapp";
import { config } from "../config";

export type SystemStatus = {
  server: { status: string; message: string };
  whatsapp: { status: string; message: string };
  database: { status: string; message: string };
  redis: { status: string; message: string };
  webhook: { status: string; message: string };
  version: string;
  lastDeployment: string;
  platform: string;
  uptimeSeconds: number;
};

export async function getSystemStatus(): Promise<SystemStatus> {
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }

  const redisOk = await pingRedis();

  let waOk = false;
  if (whatsappConfigured()) {
    try {
      const url = `${config.whatsapp.apiBase}/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${config.whatsapp.token}` } });
      waOk = res.ok;
    } catch {
      waOk = false;
    }
  }

  const status = (ok: boolean, reason: string) => ({
    status: ok ? "operational" : "down",
    message: ok ? "Operational" : reason,
  });

  const lastDeployment = await prisma.setting.findUnique({ where: { key: "system.lastDeployment" } });

  return {
    server: status(true, "Server is up"),
    whatsapp: waOk ? status(true, "Connected") : status(false, whatsappConfigured() ? "API check failed" : "Not configured"),
    database: status(dbOk, "Cannot reach database"),
    redis: status(redisOk, "Cannot reach Redis"),
    webhook: status(true, "Webhook endpoint active"),
    version: config.deployment.version,
    lastDeployment: lastDeployment?.value ?? config.deployment.deployedAt,
    platform: config.deployment.platform,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}
