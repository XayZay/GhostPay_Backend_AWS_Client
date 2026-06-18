/**
 * Kora Pay API integration.
 *
 * Handles charge initialization, charge status polling, and webhook
 * signature verification. Wrapped in withRetry for resilience.
 */
import * as crypto from "crypto";
import fetch from "node-fetch";
import { getSecret } from "./secrets";
import { logger, LogContext } from "../utils/logger";
import { withRetry } from "../utils/retry";
import type { KoraCharge, KoraChargeStatus, ParsedPaymentData } from "../types";

/**
 * Initialize a Kora checkout charge and return the checkout URL.
 */
export async function initializeKoraCharge(
  parsedData: ParsedPaymentData,
  reference: string,
  ctx?: Partial<LogContext>
): Promise<KoraCharge> {
  const secretName = process.env.KORA_SECRET_NAME ?? "ghostpay/kora";
  const secretKey = await getSecret(secretName);
  const webhookUrl = process.env.KORA_WEBHOOK_URL;

  if (!webhookUrl) {
    throw new Error("KORA_WEBHOOK_URL is not configured");
  }

  return withRetry(async () => {
    const response = await fetch(
      "https://api.korapay.com/merchant/api/v1/charges/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: parsedData.amount,
          currency: "NGN",
          reference,
          narration: parsedData.description,
          customer: {
            email: "customer@ghostpay.app",
            name: "Ghost Pay Customer",
          },
          notification_url: webhookUrl,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Kora API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      data?: { checkout_url?: string };
    };
    const checkoutUrl = data.data?.checkout_url;
    if (!checkoutUrl) {
      throw new Error("Kora response missing checkout_url");
    }

    logger.info("Kora charge initialized", ctx, { reference });
    return { checkoutUrl, reference };
  });
}

/**
 * Fetch the current status of a Kora charge by reference.
 */
export async function fetchKoraChargeStatus(
  reference: string,
  ctx?: Partial<LogContext>
): Promise<KoraChargeStatus> {
  const secretName = process.env.KORA_SECRET_NAME ?? "ghostpay/kora";
  const secretKey = await getSecret(secretName);

  return withRetry(async () => {
    const response = await fetch(
      `https://api.korapay.com/merchant/api/v1/charges/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${secretKey}` },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Kora charge lookup error ${response.status}: ${body}`);
    }

    const body = (await response.json()) as {
      data?: KoraChargeStatus;
      status?: string;
    };
    return body.data ?? { status: body.status };
  });
}

/**
 * Verify a Kora webhook HMAC-SHA256 signature.
 * Returns true if the signature is valid, false otherwise.
 *
 * This is a pure function — no retry needed.
 */
export async function verifyKoraSignature(
  rawBody: Buffer,
  signatureHeader: string
): Promise<boolean> {
  const secretName = process.env.KORA_SECRET_NAME ?? "ghostpay/kora";
  const secret = await getSecret(secretName);

  const signature = signatureHeader.trim();
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const signatureBuffer = Buffer.from(signature);
  const digestBuffer = Buffer.from(digest);

  if (
    signatureBuffer.length === digestBuffer.length &&
    crypto.timingSafeEqual(signatureBuffer, digestBuffer)
  ) {
    return true;
  }

  return false;
}

/**
 * Resolve a bank account via Kora's bank resolve endpoint.
 */
export async function resolveBankAccount(
  bankCode: string,
  accountNumber: string,
  ctx?: Partial<LogContext>
): Promise<{
  account_name: string;
  bank_name?: string;
  account_number?: string;
  bank_code?: string;
}> {
  const secretName = process.env.KORA_SECRET_NAME ?? "ghostpay/kora";
  const secretKey = await getSecret(secretName);

  return withRetry(async () => {
    const response = await fetch(
      "https://api.korapay.com/merchant/api/v1/misc/banks/resolve",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bank: bankCode,
          account: accountNumber,
          currency: "NGN",
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      logger.error("Kora resolve failed", ctx, {
        status: response.status,
        body,
      });
      throw new Error(`Kora resolve failed: ${response.status}`);
    }

    const koraData = (await response.json()) as {
      status?: boolean;
      data?: {
        account_name?: string;
        bank_name?: string;
        account_number?: string;
        bank_code?: string;
      };
    };

    if (!koraData.status || !koraData.data?.account_name) {
      throw new Error("Bank account could not be resolved");
    }

    logger.info("Bank account verified", ctx, { bankCode, accountNumber });
    return {
      account_name: koraData.data.account_name,
      bank_name: koraData.data.bank_name,
      account_number: koraData.data.account_number ?? accountNumber,
      bank_code: koraData.data.bank_code ?? bankCode,
    };
  });
}
