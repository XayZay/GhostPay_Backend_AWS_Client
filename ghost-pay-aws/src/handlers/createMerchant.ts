/**
 * Lambda: createMerchant
 *
 * Save verified payout bank details for a merchant.
 * POST { account_number, bank_code, account_name } → { status, merchantId }
 */
import { createHandler } from "../middleware/lambdaAdapter";
import { requireJwt, getMerchantId } from "../middleware/auth";
import { savePayoutDetails } from "../db/merchants";
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
    const accountNumberRaw =
      req.body.account_number ?? req.body.accountNumber;
    const bankCodeRaw = req.body.bank_code ?? req.body.bankCode;
    const accountNameRaw =
      req.body.account_name ?? req.body.accountName;

    const accountNumber =
      typeof accountNumberRaw === "string" ? accountNumberRaw.trim() : "";
    const bankCode =
      typeof bankCodeRaw === "string" ? bankCodeRaw.trim() : "";
    const accountName =
      typeof accountNameRaw === "string" ? accountNameRaw.trim() : "";

    if (!accountNumber || !bankCode || !accountName) {
      res.status(400).json({
        error: "missing_fields",
        message: "account_number, bank_code, and account_name are required",
      });
      return;
    }

    await savePayoutDetails(merchantId, {
      accountNumber,
      bankCode,
      accountName,
    });

    logger.info("Merchant payout details saved", ctx);
    res.status(200).json({ status: "success", merchantId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("createMerchant failed", ctx, { error: message });
    res.status(500).json({ error: "create_merchant_failed", message });
  }
});
