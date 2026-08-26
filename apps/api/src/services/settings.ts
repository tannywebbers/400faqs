import { prisma } from "../lib/prisma";
import { cacheKeys, cacheGet, cacheSet, cacheDel } from "../lib/redis";

export async function getPublicSettings() {
  const cached = await cacheGet<Record<string, string>>(cacheKeys.publicSettings);
  if (cached) return cached;
  const rows = await prisma.setting.findMany({ where: { public: true } });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  await cacheSet(cacheKeys.publicSettings, map, 300);
  return map;
}

export async function getAllSettings() {
  return prisma.setting.findMany({ orderBy: { group: "asc" } });
}

export async function updateSetting(key: string, value: string) {
  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  await cacheDel(cacheKeys.publicSettings);
  return setting;
}

export async function updateManySettings(entries: { key: string; value: string }[]) {
  const result = [];
  for (const e of entries) {
    result.push(await prisma.setting.upsert({ where: { key: e.key }, update: { value: e.value }, create: { key: e.key, value: e.value } }));
  }
  await cacheDel(cacheKeys.publicSettings);
  return result;
}

export function settingBool(map: Record<string, string>, key: string, fallback = false): boolean {
  const v = map[key];
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export function settingNumber(map: Record<string, string>, key: string, fallback: number): number {
  const n = Number(map[key]);
  return Number.isFinite(n) ? n : fallback;
}
