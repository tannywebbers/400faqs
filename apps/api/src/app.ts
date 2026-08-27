import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import { config } from "./config";
import { publicRouter } from "./routes/public";
import { adminRouter } from "./routes/admin";
import { webhookRouter } from "./routes/webhook";
import { monetizationRouter } from "./routes/monetization";
import { notFoundHandler, errorHandler } from "./middleware/error";
import { prisma } from "./lib/prisma";
import { logger } from "./lib/logger";

export function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  if (!config.isProd) app.use(morgan("dev"));

  // Maintenance mode gate
  app.use((req, res, next) => {
    if (config.maintenanceMode && !req.path.startsWith("/api/webhooks") && !req.path.startsWith("/api/public/status")) {
      return res.status(503).json({ success: false, error: { message: "Under maintenance. Please try again later." } });
    }
    next();
  });

  // Health
  app.get("/api/health", async (_req, res) => {
    let db = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    res.json({ status: "ok", uptime: process.uptime(), db, timestamp: new Date().toISOString(), version: config.deployment.version });
  });

  // Static uploads
  app.use("/uploads", express.static(path.resolve(config.uploads.dir)));

  app.use("/api/public", publicRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/webhooks", webhookRouter);
  app.use("/api/monetization", monetizationRouter);

  app.get("/", (_req, res) => {
    res.json({ name: "400QUES API", version: config.deployment.version, status: "running" });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
