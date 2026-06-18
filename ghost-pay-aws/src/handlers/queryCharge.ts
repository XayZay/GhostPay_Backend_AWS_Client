/**
 * Lambda: queryCharge
 *
 * EventBridge scheduled function (every 2 minutes).
 * Polls Kora for stale pending transactions and updates their status.
 */
import type { ScheduledEvent } from "aws-lambda";
import { dispatchPaymentConfirmation } from "../application/paymentConfirmation";
import {
  getPendingTransactionsBefore,
  markTransactionFailed,
  markTransactionPaid,
} from "../db/transactions";
import { fetchKoraChargeStatus } from "../services/kora";
import { createRequestContext, logger } from "../utils/logger";

export const handler = async (_event: ScheduledEvent): Promise<void> => {
  const ctx = createRequestContext();

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
          await dispatchPaymentConfirmation(
            {
              transactionId,
              merchantId: transaction.merchantId,
              amount: Number(transaction.amount ?? 0),
              itemName: String(transaction.item ?? "item"),
            },
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
