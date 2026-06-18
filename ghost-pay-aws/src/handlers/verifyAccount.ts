/**
 * Lambda: verifyAccount
 *
 * Verify a bank account via Kora's resolve endpoint.
 * POST { account_number, bank_code } → resolved account details
 */
import { createHandler } from "../middleware/lambdaAdapter";
import { requireJwt } from "../middleware/auth";
import { resolveBankAccount } from "../services/kora";
import { logger, createRequestContext } from "../utils/logger";

export const handler = createHandler(async (req, res) => {
  const ctx = createRequestContext();

  if (req.method !== "POST") {
    res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (!(await requireJwt(req, res, ctx))) return;

  try {
    // Accept both snake_case and camelCase
    const accountNumberRaw =
      req.body.account_number ?? req.body.accountNumber;
    const bankCodeRaw = req.body.bank_code ?? req.body.bankCode;

    const accountNumber =
      typeof accountNumberRaw === "string" ? accountNumberRaw.trim() : "";
    const bankCode =
      typeof bankCodeRaw === "string" ? bankCodeRaw.trim() : "";

    if (!accountNumber || !/^\d{10}$/.test(accountNumber)) {
      res.status(400).json({
        error: "invalid_account_number",
        message: "Account number must be 10 digits",
      });
      return;
    }

    if (!bankCode || !/^\d{3}$/.test(bankCode)) {
      res.status(400).json({
        error: "invalid_bank_code",
        message: "Bank code must be 3 digits",
      });
      return;
    }

    const result = await resolveBankAccount(bankCode, accountNumber, ctx);

    logger.info("Bank account verified", ctx, { bankCode, accountNumber });
    res.status(200).json({
      account_name: result.account_name,
      bank_name: result.bank_name ?? "",
      account_number: result.account_number ?? accountNumber,
      bank_code: result.bank_code ?? bankCode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("could not be resolved")) {
      res.status(404).json({
        error: "account_not_found",
        message: "Bank account could not be resolved",
      });
      return;
    }

    logger.error("verifyAccount failed", ctx, { error: message });
    res.status(502).json({
      error: "bank_verification_failed",
      message:
        "Could not verify bank account. Please check the details and try again.",
    });
  }
});
