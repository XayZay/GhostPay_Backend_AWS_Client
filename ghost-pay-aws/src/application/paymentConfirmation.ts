import { getMerchant } from "../db/merchants";
import { getTransaction } from "../db/transactions";
import { sendPushNotification } from "../services/fcm";
import { uploadConfirmationAudio } from "../services/storage";
import { generateYarnGptAudio } from "../services/yarngpt";
import { logger, type LogContext } from "../utils/logger";

export interface DispatchPaymentConfirmationInput {
  transactionId: string;
  merchantId: string;
  amount?: number;
  itemName?: string;
}

/**
 * Generate and dispatch the merchant-facing payment confirmation.
 */
export async function dispatchPaymentConfirmation(
  input: DispatchPaymentConfirmationInput,
  ctx: Partial<LogContext>
): Promise<void> {
  try {
    let amount = input.amount;
    let itemName = input.itemName;

    if (amount === undefined || itemName === undefined) {
      const transaction = await getTransaction(input.transactionId);
      if (!transaction) {
        logger.warn("Transaction missing for confirmation", ctx);
        return;
      }

      amount = Number(transaction.amount ?? 0);
      itemName = String(transaction.item ?? "item");
    }

    const audio = await generateYarnGptAudio(amount, itemName, ctx);
    const audioUrl = await uploadConfirmationAudio(
      input.transactionId,
      audio.buffer,
      audio.contentType
    );

    const merchant = await getMerchant(input.merchantId);
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
