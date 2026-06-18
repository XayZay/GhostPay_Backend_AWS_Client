/**
 * WhatsApp Business Cloud API integration.
 *
 * Sends payment links via WhatsApp template messages.
 * Wrapped in withRetry for resilience.
 */
import fetch from "node-fetch";
import { getJsonSecret } from "./secrets";
import { logger, LogContext } from "../utils/logger";
import { withRetry } from "../utils/retry";
import type { ParsedPaymentData } from "../types";

interface WhatsAppSecret {
  token: string;
  phoneNumberId: string;
}

/**
 * Send a WhatsApp payment link to the customer.
 */
export async function sendWhatsAppPaymentLink(
  parsedData: ParsedPaymentData,
  koraCheckoutUrl: string,
  ctx?: Partial<LogContext>
): Promise<boolean> {
  try {
    const secretName =
      process.env.WHATSAPP_SECRET_NAME ?? "ghostpay/whatsapp";
    const whatsapp = await getJsonSecret<WhatsAppSecret>(secretName);
    const phoneNumberId =
      process.env.WHATSAPP_PHONE_NUMBER_ID || whatsapp.phoneNumberId;

    if (!whatsapp.token || !phoneNumberId) {
      throw new Error("WhatsApp credentials not configured");
    }

    return await withRetry(async () => {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${whatsapp.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: parsedData.customer_phone,
            type: "template",
            template: {
              name: "ghost_pay_payment_link",
              language: { code: "en" },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: parsedData.description },
                    { type: "text", text: koraCheckoutUrl },
                  ],
                },
              ],
            },
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`WhatsApp API error ${response.status}: ${body}`);
      }

      logger.info("WhatsApp payment link sent", ctx, {
        to: parsedData.customer_phone,
      });
      return true;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("WhatsApp payment link failed", ctx, {
      error: message,
      to: parsedData.customer_phone,
    });
    return false;
  }
}
