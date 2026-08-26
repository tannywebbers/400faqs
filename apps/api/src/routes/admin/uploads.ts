import { Router } from "express";
import { parsePagination } from "../../middleware/validate";
import { ok } from "../../lib/response";
import { prisma } from "../../lib/prisma";
import { upload, processImage, uploadedUrl, saveUploadRecord } from "../../lib/upload";
import { AppError } from "../../lib/response";
import { type AdminRequest } from "../../middleware/auth";

export const uploadsRouter = Router();

uploadsRouter.get("/", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [total, items] = await Promise.all([
    prisma.upload.count(),
    prisma.upload.findMany({ orderBy: { createdAt: "desc" }, skip, take: limit }),
  ]);
  res.json(ok(items, { page, limit, total, totalPages: Math.ceil(total / limit) }));
});

uploadsRouter.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) throw new AppError(400, "No file uploaded");
  await processImage(req.file.path);
  const url = uploadedUrl(req, req.file.filename);
  const admin = (req as unknown as AdminRequest).admin;
  await saveUploadRecord(url, req.file.mimetype, req.file.size, admin.id);
  res.json(ok({ url, filename: req.file.filename, size: req.file.size }));
});
