/**
 * Lambda: koraWebhook
 *
 * Receives Kora payment webhooks, verifies HMAC signature,
 * marks transactions as paid, and dispatches payment confirmations.
 */
import { dispatchPaymentConfirmation } from "../application/paymentConfirmation";
import {
  getTransaction,
  markTransactionPaid,
  upsertPaidTransaction,
} from "../db/transactions";
import { createHandler } from "../middleware/lambdaAdapter";
import { verifyKoraSignature } from "../services/kora";
import { createRequestContext, logger } from "../utils/logger";
import type { KoraEvent } from "../types";

export const handler = createHandler(async (req, res) => {
  const ctx = createRequestContext();

  if (req.method !== "POST") {
    res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" });
    return;
  }

  const signature = req.header("x-korapay-signature");
  const isValid = await verifyKoraSignature(req.rawBody, signature);
  if (!isValid) {
    logger.warn("Kora signature verification failed", ctx);
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  try {
    const event: KoraEvent = req.body as KoraEvent;
    const data = event.data;

    if (data?.status !== "success") {
      res.status(200).json({ received: true });
      return;
    }

    const reference = data.reference ?? data.transaction_reference;
    if (!reference) {
      logger.error("Kora success event missing reference", ctx, { event });
      res.status(200).json({ received: true });
      return;
    }

    ctx.transactionId = reference;

    const existing = await getTransaction(reference);
    const merchantId =
      existing?.merchantId ?? data.merchantId ?? data.merchant_id;

    if (existing) {
      await markTransactionPaid(reference);
    } else {
      await upsertPaidTransaction(reference, data as Record<string, unknown>);
    }

    if (merchantId) {
      ctx.merchantId = merchantId;
      dispatchPaymentConfirmation(
        { transactionId: reference, merchantId },
        ctx
      ).catch((error) => {
        logger.error("Background confirmation failed", ctx, {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } else {
      logger.warn("Skipping confirmation; merchantId missing", ctx);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Kora webhook processing failed", ctx, { error: message });
  }

  res.status(200).json({ received: true });
});
