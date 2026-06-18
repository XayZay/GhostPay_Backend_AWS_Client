/**
 * Lambda: merchantAuth
 *
 * Phone-based merchant signup/login.
 * POST { name, phone } → { token, merchantId }
 */
import { createHandler } from "../middleware/lambdaAdapter";
import { signMerchantToken } from "../middleware/auth";
import { upsertMerchant } from "../db/merchants";
import { normalizeNigerianPhone } from "../utils/phone";
import { logger, createRequestContext } from "../utils/logger";

export const handler = createHandler(async (req, res) => {
  const ctx = createRequestContext();

  if (req.method !== "POST") {
    res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
    const name =
      typeof req.body.name === "string" ? (req.body.name as string).trim() : "";
    const phoneRaw =
      typeof req.body.phone === "string"
        ? (req.body.phone as string).trim()
        : "";

    if (!name || name.length < 2) {
      res.status(400).json({
        error: "invalid_name",
        message: "Name must be at least 2 characters",
      });
      return;
    }

    const phone = normalizeNigerianPhone(phoneRaw);
    if (!phone) {
      res.status(400).json({
        error: "invalid_phone",
        message: "Phone must be a valid Nigerian number (e.g. 08031234567)",
      });
      return;
    }

    // Upsert merchant in DynamoDB
    await upsertMerchant(phone, { name, phone });

    // Sign JWT
    const token = await signMerchantToken(phone, phone);

    logger.info("Merchant authenticated", { ...ctx, merchantId: phone });
    res.status(200).json({ token, merchantId: phone });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("merchantAuth failed", ctx, { error: message });
    res.status(500).json({ error: "auth_failed", message });
  }
});
