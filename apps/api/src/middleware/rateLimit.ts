import rateLimit from "express-rate-limit";
import { config } from "../config";

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimits.public,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many requests, slow down." } },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.rateLimits.auth,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many attempts, try again later." } },
});

export const contributionLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, error: { message: "Too many submissions, slow down." } },
});
