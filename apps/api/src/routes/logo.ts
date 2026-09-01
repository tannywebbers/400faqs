import { Router } from "express";
import { prisma } from "../lib/prisma";

export const logoRouter = Router();

const LOGO_KEY = "logo";
const CACHE_SECONDS = 60 * 60 * 24; // 1 day

// Serves the site logo stored as a bytea blob directly from Postgres. Best
// effort: if there is no stored logo (or the table/DB is unreachable) a 404 is
// returned so the UI falls back to its text mark — never a crash.
logoRouter.get("/", async (_req, res) => {
  try {
    const asset = await prisma.siteAsset.findUnique({ where: { key: LOGO_KEY }, select: { mime: true, data: true } });
    if (!asset) {
      return res.status(404).end();
    }
    res.set("Content-Type", asset.mime);
    res.set("Cache-Control", `public, max-age=${CACHE_SECONDS}, immutable`);
    res.set("X-Content-Type-Options", "nosniff");
    return res.send(asset.data);
  } catch {
    return res.status(404).end();
  }
});
