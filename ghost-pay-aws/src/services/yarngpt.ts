/**
 * YarnGPT Nigerian Text-to-Speech service.
 *
 * Generates voice confirmations in Nigerian English/Pidgin
 * when a payment is received.
 */
import fetch from "node-fetch";
import { getSecret } from "./secrets";
import { logger, LogContext } from "../utils/logger";
import { withRetry } from "../utils/retry";
import { formatAmountForSpeech } from "../utils/speech";
import type { YarnGptAudioResponse } from "../types";

/**
 * Generate a voice confirmation audio using YarnGPT.
 */
export async function generateYarnGptAudio(
  amount: number,
  itemName: string,
  ctx?: Partial<LogContext>
): Promise<YarnGptAudioResponse> {
  const secretName = process.env.YARNGPT_SECRET_NAME ?? "ghostpay/yarngpt";
  const apiKey = await getSecret(secretName);

  return withRetry(async () => {
    const spokenAmount = formatAmountForSpeech(amount);
    const text = `Boss, your payment don enter! ${spokenAmount} for the ${itemName}.`;

    const response = await fetch("https://yarngpt.ai/api/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice: "osagie",
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`YarnGPT API error ${response.status}: ${body}`);
    }

    const buffer = await response.buffer();
    const contentType =
      response.headers.get("content-type") ?? "audio/mpeg";

    logger.info("YarnGPT audio generated", ctx, {
      amount,
      itemName,
      sizeBytes: buffer.length,
    });

    return { buffer, contentType };
  });
}
