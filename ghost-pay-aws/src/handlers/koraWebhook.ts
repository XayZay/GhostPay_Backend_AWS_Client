/**
 * Lambda: koraWebhook
 *
 * Receives Kora payment webhooks, verifies HMAC signature,
 * marks transactions as paid, and dispatches payment confirmations.
 */
import { createHandler } from "../middleware/lambdaAdapter";
import { verifyKoraSignature } from "../services/kora";
import { sendPushNotification } from "../services/fcm";
import { generateYarnGptAudio } from "../services/yarngpt";
import { uploadConfirmationAudio } from "../services/storage";
import {
  getTransaction,
  markTransactionPaid,
  upsertPaidTransaction,
} from "../db/transactions";
import { getMerchant } from "../db/merchants";
import { logger, createRequestContext } from "../utils/logger";
import type { KoraEvent } from "../types";

/**
 * Dispatch payment confirmation: generate voice audio → upload to S3 → send FCM push.
 */
async function dispatchPaymentConfirmation(
  transactionId: string,
  merchantId: string,
  ctx: { requestId: string; merchantId?: string; transactionId?: string }
): Promise<void> {
  try {
    const transaction = await getTransaction(transactionId);
    if (!transaction) {
      logger.warn("Transaction missing for confirmation", ctx);
      return;
    }

    const amount = Number(transaction.amount ?? 0);
    const itemName = String(transaction.item ?? "item");

    // Generate voice confirmation audio
    const audio = await generateYarnGptAudio(amount, itemName, ctx);

    // Upload to S3 and get presigned URL
    const audioUrl = await uploadConfirmationAudio(
      transactionId,
      audio.buffer,
      audio.contentType
    );

    // Get merchant FCM token and send push notification
    const merchant = await getMerchant(merchantId);
    if (!merchant?.fcmToken) {
      logger.warn("Merchant FCM token missing", ctx);
      return;
    }

    await sendPushNotification(
      merchant.fcmToken,
      {
        type: "payment_confirmed",
        audio_url: audioUrl,
        amount: String(amount),
        item: itemName,
      },
      ctx
    );

    logger.info("Payment confirmation dispatched", ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Payment confirmation dispatch failed", ctx, {
      error: message,
    });
  }
}

export const handler = createHandler(async (req, res) => {
  const ctx = createRequestContext();

  if (req.method !== "POST") {
    res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" });
    return;
  }

  // Verify Kora HMAC signature
  const signature = req.header("x-korapay-signature");
  const isValid = await verifyKoraSignature(req.rawBody, signature);
  if (!isValid) {
    logger.warn("Kora signature verification failed", ctx);
    res.status(401).json({ error: "invalid_signature" });
    return;
  }

  try {
    // Parse event from body
    const event: KoraEvent = req.body as KoraEvent;
    const data = event.data;

    if (data?.status !== "success") {
      // Acknowledge non-success events without processing
      res.status(200).json({ received: true });
      return;
    }

    const reference =
      data.reference ?? data.transaction_reference;
    if (!reference) {
      logger.error("Kora success event missing reference", ctx, { event });
      res.status(200).json({ received: true });
      return;
    }

    ctx.transactionId = reference;

    // Check if transaction exists locally
    const existing = await getTransaction(reference);
    const merchantId =
      existing?.merchantId ??
      data.merchantId ??
      data.merchant_id;

    if (existing) {
      await markTransactionPaid(reference);
    } else {
      await upsertPaidTransaction(reference, data as Record<string, unknown>);
    }

    // Dispatch payment confirmation (fire-and-forget)
    if (merchantId) {
      ctx.merchantId = merchantId;
      dispatchPaymentConfirmation(reference, merchantId, ctx).catch(
        (error) => {
          logger.error("Background confirmation failed", ctx, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      );
    } else {
      logger.warn("Skipping confirmation; merchantId missing", ctx);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Kora webhook processing failed", ctx, { error: message });
  }

  // Always acknowledge to prevent retries
  res.status(200).json({ received: true });
});
