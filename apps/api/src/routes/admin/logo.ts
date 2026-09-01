import { Router } from "express";
import multer from "multer";
import { prisma } from "../../lib/prisma";
import { ok, AppError } from "../../lib/response";
import { updateManySettings } from "../../services/settings";

const LOGO_KEY = "logo";
const LOGO_SETTING = "site.logo_blob";

// Keep the whole logo in memory so it can be stored as a bytea blob directly,
// with no dependency on a writable local filesystem (Vercel serverless).
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("INVALID_FILE_TYPE"));
  },
});

export const logoAdminRouter = Router();

logoAdminRouter.get("/status", async (_req, res) => {
  try {
    const asset = await prisma.siteAsset.findUnique({
      where: { key: LOGO_KEY },
      select: { mime: true, size: true, updatedAt: true },
    });
    res.json(ok({ hasLogo: Boolean(asset), ...(asset ?? {}) }));
  } catch {
    // Table not migrated yet / DB unreachable — treat as "no logo" rather than
    // crashing so the admin page still renders.
    res.json(ok({ hasLogo: false }));
  }
});

logoAdminRouter.post("/", memoryUpload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw new AppError(400, "No image file provided");

  await prisma.siteAsset.upsert({
    where: { key: LOGO_KEY },
    update: { mime: file.mimetype, size: file.size, data: file.buffer },
    create: { key: LOGO_KEY, mime: file.mimetype, size: file.size, data: file.buffer },
  });
  await updateManySettings([{ key: LOGO_SETTING, value: "1", public: true, group: "general" }]);

  res.json(ok({ hasLogo: true, mime: file.mimetype, size: file.size }));
});

logoAdminRouter.delete("/", async (_req, res) => {
  await prisma.siteAsset.deleteMany({ where: { key: LOGO_KEY } });
  await updateManySettings([{ key: LOGO_SETTING, value: "0", public: true, group: "general" }]);
  res.json(ok({ hasLogo: false }));
});
