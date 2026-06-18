/**
 * Lambda: merchantFcm
 *
 * Store or update merchant FCM token for push notifications.
 * POST { fcm_token } → { status }
 */
import { createHandler } from "../middleware/lambdaAdapter";
import { requireJwt, getMerchantId } from "../middleware/auth";
import { saveFcmToken } from "../db/merchants";
import { logger, createRequestContext } from "../utils/logger";

export const handler = createHandler(async (req, res) => {
  const ctx = createRequestContext();

  if (req.method !== "POST") {
    res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (!(await requireJwt(req, res, ctx))) return;

  const merchantId = await getMerchantId(req, ctx);
  if (!merchantId) {
    res.status(401).json({ error: "merchant_id_required" });
    return;
  }
  ctx.merchantId = merchantId;

  try {
    // Accept both snake_case and camelCase
    const tokenRaw = req.body.fcm_token ?? req.body.fcmToken;
    const fcmToken =
      typeof tokenRaw === "string" ? tokenRaw.trim() : "";

    if (!fcmToken) {
      res.status(400).json({
        error: "missing_fcm_token",
        message: "fcm_token is required",
      });
      return;
    }

    await saveFcmToken(merchantId, fcmToken);

    logger.info("FCM token updated", ctx);
    res.status(200).json({ status: "success" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("merchantFcm failed", ctx, { error: message });
    res.status(500).json({ error: "fcm_update_failed", message });
  }
});
