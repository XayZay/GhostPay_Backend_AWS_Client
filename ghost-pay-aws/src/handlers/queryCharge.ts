/**
 * Lambda: queryCharge
 *
 * EventBridge scheduled function (every 2 minutes).
 * Polls Kora for stale pending transactions and updates their status.
 *
 * This handler does NOT use the Lambda adapter — it receives
 * a raw EventBridge/CloudWatch Events event, not an HTTP request.
 */
import type { ScheduledEvent } from "aws-lambda";
import { fetchKoraChargeStatus } from "../services/kora";
import { sendPushNotification } from "../services/fcm";
import { generateYarnGptAudio } from "../services/yarngpt";
import { uploadConfirmationAudio } from "../services/storage";
import {
  getPendingTransactionsBefore,
  markTransactionPaid,
  markTransactionFailed,
} from "../db/transactions";
import { getMerchant } from "../db/merchants";
import { logger, createRequestContext } from "../utils/logger";

/**
 * Dispatch payment confirmation for a resolved transaction.
 */
async function dispatchConfirmation(
  transactionId: string,
  merchantId: string,
  amount: number,
  itemName: string,
  ctx: { requestId: string; merchantId?: string; transactionId?: string }
): Promise<void> {
  try {
    const audio = await generateYarnGptAudio(amount, itemName, ctx);
    const audioUrl = await uploadConfirmationAudio(
      transactionId,
      audio.buffer,
      audio.contentType
    );

    const merchant = await getMerchant(merchantId);
    if (!merchant?.fcmToken) {
      logger.warn("Merchant FCM token missing (queryCharge)", ctx);
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("queryCharge confirmation failed", ctx, { error: message });
  }
}

export const handler = async (_event: ScheduledEvent): Promise<void> => {
  const ctx = createRequestContext();

  // Cutoff: transactions older than 2 minutes
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const pendingTransactions = await getPendingTransactionsBefore(cutoff);

  let resolved = 0;

  for (const transaction of pendingTransactions) {
    const transactionId = transaction.reference;
    if (!transactionId) continue;

    ctx.transactionId = transactionId;

    try {
      const charge = await fetchKoraChargeStatus(transactionId, ctx);
      const status = String(charge.status ?? "").toLowerCase();

      if (status === "success") {
        await markTransactionPaid(transactionId);

        if (transaction.merchantId) {
          ctx.merchantId = transaction.merchantId;
          await dispatchConfirmation(
            transactionId,
            transaction.merchantId,
            Number(transaction.amount ?? 0),
            String(transaction.item ?? "item"),
            ctx
          );
        } else {
          logger.warn("Skipping fallback confirmation; merchantId missing", ctx);
        }
        resolved += 1;
      }

      if (status === "failed") {
        await markTransactionFailed(transactionId);
        resolved += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("queryCharge transaction check failed", ctx, {
        error: message,
        transactionId,
      });
    }
  }

  logger.info("queryCharge fallback complete", ctx, {
    checked: pendingTransactions.length,
    resolved,
  });
};
