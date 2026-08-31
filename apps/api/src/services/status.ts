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

// Bound a single check so one slow/black-holed dependency can never make the
// whole status call (or a health page) hang forever.
function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(onTimeout());
      }
    }, ms);
    promise
      .then((v) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(v);
        }
      })
      .catch(() => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(onTimeout());
        }
      });
  });
}

export async function getSystemStatus(): Promise<SystemStatus> {
  let dbOk = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }

  const redisOk = await pingRedis();

  let waOk = false;
  let waConfigured = whatsappConfigured();
  if (waConfigured) {
    try {
      const url = `${config.whatsapp.apiBase}/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}`;
      const res = await withTimeout(
        fetch(url, { headers: { Authorization: `Bearer ${config.whatsapp.token}` } }),
        5000,
        () => null as unknown as Response,
      );
      waOk = Boolean(res) && res.ok;
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
    whatsapp: waOk ? status(true, "Connected") : status(false, waConfigured ? "API check failed or timed out" : "Not configured"),
    database: status(dbOk, "Cannot reach database"),
    redis: status(redisOk, "Cannot reach Redis"),
    webhook: status(true, "Webhook endpoint active"),
    version: config.deployment.version,
    lastDeployment: lastDeployment?.value ?? config.deployment.deployedAt,
    platform: config.deployment.platform,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}
