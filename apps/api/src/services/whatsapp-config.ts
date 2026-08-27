import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { logger } from "../lib/logger";

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  graphVersion: string;
  apiBase: string;
  appId: string;
  appSecret: string;
};

export type MaskedWhatsAppConfig = {
  configured: boolean;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
  graphVersion: string;
  apiBase: string;
  appId: string;
  maskedToken: string;
  maskedSecret: string;
  source: "env" | "database";
};

const SETTINGS_PREFIX = "whatsapp.";

const DEFAULTS: Record<string, string> = {
  "whatsapp.webhookVerifyToken": "400ques-verify",
  "whatsapp.graphVersion": "v19.0",
  "whatsapp.apiBase": "https://graph.facebook.com",
};

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value;
}

async function setSetting(key: string, value: string, description?: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value, type: "string", group: "whatsapp", description: description ?? "" },
    update: { value },
  });
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const dbToken = await getSetting("whatsapp.accessToken");
  const dbPhoneId = await getSetting("whatsapp.phoneNumberId");

  return {
    accessToken: dbToken || config.whatsapp.token,
    phoneNumberId: dbPhoneId || config.whatsapp.phoneNumberId,
    businessAccountId: (await getSetting("whatsapp.businessAccountId")) || "",
    webhookVerifyToken: (await getSetting("whatsapp.webhookVerifyToken")) || config.whatsapp.verifyToken,
    graphVersion: (await getSetting("whatsapp.graphVersion")) || config.whatsapp.graphVersion,
    apiBase: (await getSetting("whatsapp.apiBase")) || config.whatsapp.apiBase,
    appId: (await getSetting("whatsapp.appId")) || "",
    appSecret: (await getSetting("whatsapp.appSecret")) || "",
  };
}

export async function getMaskedConfig(): Promise<MaskedWhatsAppConfig> {
  const cfg = await getWhatsAppConfig();
  const hasDbToken = await getSetting("whatsapp.accessToken");

  return {
    configured: Boolean(cfg.accessToken && cfg.phoneNumberId),
    phoneNumberId: cfg.phoneNumberId,
    businessAccountId: cfg.businessAccountId,
    webhookVerifyToken: cfg.webhookVerifyToken,
    graphVersion: cfg.graphVersion,
    apiBase: cfg.apiBase,
    appId: cfg.appId,
    maskedToken: maskSecret(cfg.accessToken),
    maskedSecret: maskSecret(cfg.appSecret),
    source: hasDbToken ? "database" : "env",
  };
}

export async function updateWhatsAppConfig(
  updates: Partial<Pick<WhatsAppConfig, "accessToken" | "phoneNumberId" | "businessAccountId" | "appId" | "appSecret" | "graphVersion" | "apiBase" | "webhookVerifyToken">>
): Promise<MaskedWhatsAppConfig> {
  const fields: [string, string, string?][] = [
    ["whatsapp.accessToken", updates.accessToken ?? "", "WhatsApp Business API access token"],
    ["whatsapp.phoneNumberId", updates.phoneNumberId ?? "", "WhatsApp Phone Number ID"],
    ["whatsapp.businessAccountId", updates.businessAccountId ?? "", "WhatsApp Business Account ID"],
    ["whatsapp.appId", updates.appId ?? "", "Meta App ID"],
    ["whatsapp.appSecret", updates.appSecret ?? "", "Meta App Secret"],
    ["whatsapp.graphVersion", updates.graphVersion ?? "", "Graph API version"],
    ["whatsapp.apiBase", updates.apiBase ?? "", "Graph API base URL"],
    ["whatsapp.webhookVerifyToken", updates.webhookVerifyToken ?? "", "Webhook verify token"],
  ];

  for (const [key, value, desc] of fields) {
    if (value !== "") {
      await setSetting(key, value, desc);
    }
  }

  return getMaskedConfig();
}

export async function checkConnectionStatus(): Promise<{
  connected: boolean;
  phoneInfo?: { verifiedName?: string; displayPhoneNumber?: string };
  error?: string;
}> {
  const cfg = await getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    return { connected: false, error: "WhatsApp not configured" };
  }

  try {
    const url = `${cfg.apiBase}/${cfg.graphVersion}/${cfg.phoneNumberId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error("[whatsapp-config] connection check failed", { status: res.status, body: body.slice(0, 300) });
      return { connected: false, error: `API returned ${res.status}` };
    }

    const data = (await res.json()) as { verified_name?: string; display_phone_number?: string };
    return {
      connected: true,
      phoneInfo: {
        verifiedName: data.verified_name,
        displayPhoneNumber: data.display_phone_number,
      },
    };
  } catch (err) {
    logger.error("[whatsapp-config] connection check error", (err as Error).message);
    return { connected: false, error: (err as Error).message };
  }
}

export function generateVerifyToken(): string {
  return `400ques-verify-${crypto.randomBytes(16).toString("hex")}`;
}

export function getWebhookUrl(): string {
  return `${config.apiUrl}/api/webhooks/whatsapp`;
}

export async function regenerateVerifyToken(): Promise<{ verifyToken: string; webhookUrl: string }> {
  const token = generateVerifyToken();
  await setSetting("whatsapp.webhookVerifyToken", token, "Webhook verify token");
  return { verifyToken: token, webhookUrl: getWebhookUrl() };
}
