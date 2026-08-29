import { Router, type Request, type Response } from "express";
import { handleProviderCallback } from "../services/adproviders";
import { AppError } from "../lib/response";

/**
 * Provider-agnostic callback / postback endpoint.
 *
 * Ad providers that support webhooks/postbacks point their callback URL here:
 *   POST /api/webhooks/ads/:providerId
 *
 * The request is validated by the provider's adapter (secret / token / HMAC),
 * de-duplicated, and recorded without client code ever seeing credentials.
 */
export const adCallbackRouter = Router();

adCallbackRouter.post("/ads/:providerId", async (req: Request, res: Response) => {
  const providerId = req.params.providerId;
  if (!providerId) throw new AppError(400, "providerId is required");

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString("utf8") ?? JSON.stringify(req.body);

  const headers: Record<string, string | string[] | undefined> = {};
  for (const key of Object.keys(req.headers)) {
    const val = req.headers[key];
    if (typeof val === "string" || Array.isArray(val)) headers[key] = val;
  }

  const result = await handleProviderCallback(providerId, {
    rawBody,
    headers,
    query: req.query ?? {},
  });

  res.json({ success: true, valid: true, deduped: result.reason === "duplicate_ignored" });
});
