import fs from "fs";
import path from "path";
import multer from "multer";
import sharp from "sharp";
import crypto from "crypto";
import { config } from "../config";
import { prisma } from "./prisma";
import { logger } from "./logger";

fs.mkdirSync(config.uploads.dir, { recursive: true });

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploads.dir),
  filename: (_req, file, cb) => {
    // Extension is derived from the validated MIME type (never from the
    // client-supplied original filename) so stored files can only ever be
    // served with an image content type.
    const ext = MIME_EXT[file.mimetype] ?? ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("INVALID_FILE_TYPE"));
  },
});

export async function getMaxUploadBytes(): Promise<number> {
  const setting = await prisma.setting.findUnique({ where: { key: "uploads.maxSizeMB" } });
  const mb = Number(setting?.value ?? 5);
  return Math.max(1, mb) * 1024 * 1024;
}

export async function processImage(filePath: string): Promise<void> {
  try {
    const img = sharp(filePath);
    const meta = await img.metadata();
    if (meta.width && meta.width > 1600) {
      await img.resize({ width: 1600, withoutEnlargement: true }).toFile(`${filePath}.tmp`);
      fs.renameSync(`${filePath}.tmp`, filePath);
    }
    if (meta.format === "png" || meta.format === "jpeg" || meta.format === "webp") {
      const out = `${filePath}.opt${path.extname(filePath)}`;
      await img.jpeg({ quality: 80 }).toFile(out);
      fs.renameSync(out, filePath);
    }
  } catch (err) {
    logger.warn("[upload] image processing failed", (err as Error).message);
  }
}

export function uploadedUrl(req: { protocol: string; get: (h: string) => string | undefined }, filename: string): string {
  const base = config.apiUrl || `${req.protocol}://${req.get("host") ?? "localhost"}`;
  return `${base}${config.uploads.publicUrl}/${filename}`;
}

export async function saveUploadRecord(url: string, mime: string, size: number, uploadedBy?: string) {
  return prisma.upload.create({ data: { url, mime, size, uploadedBy } });
}
