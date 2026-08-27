import { Router } from "express";
import { monetizationLimiter, codeLimiter } from "../middleware/rateLimit";
import { ok, AppError } from "../lib/response";
import {
  getGateStatusByToken,
  requestVerificationCode,
  selectSnippetsForPage,
  recordEvent,
} from "../services/monetization";
import { prisma } from "../lib/prisma";

/**
 * Public monetization endpoints — no admin auth.
 * Only exposes what the verification page needs.
 */
export const monetizationRouter = Router();

monetizationRouter.get("/:token", monetizationLimiter, async (req, res) => {
  const status = await getGateStatusByToken(req.params.token);

  // Record a page view for the analytics foundation (best effort).
  if (status.status === "valid") {
    const gate = await prisma.monetizationGate.findUnique({ where: { publicToken: req.params.token } });
    if (gate) {
      await recordEvent("LINK_OPENED", { gateId: gate.id, sessionId: gate.sessionId, userId: gate.userId });
    }
  }

  const ads = await selectSnippetsForPage();
  res.json(ok({ status, ads }));
});

monetizationRouter.post("/:token/code", codeLimiter, async (req, res) => {
  const result = await requestVerificationCode(req.params.token);
  if (!result.ok) {
    const messageMap: Record<string, string> = {
      invalid: "This verification link is invalid.",
      verified: "This verification was already completed.",
      cancelled: "This verification is no longer active.",
      failed: "This verification has been disabled after too many attempts.",
      expired: "This verification link has expired.",
      countdown: "Please wait for the countdown to finish.",
    };
    throw new AppError(400, messageMap[result.reason ?? "invalid"] ?? "Unable to generate a code.");
  }
  res.json(ok({ code: result.code }));
});