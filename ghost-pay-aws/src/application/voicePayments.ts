import * as crypto from "crypto";
import { parseIntent } from "../geminiParser";
import { getCachedResponse, saveCachedResponse } from "../db/idempotency";
import { createTransaction } from "../db/transactions";
import { initializeKoraCharge } from "../services/kora";
import { sendWhatsAppPaymentLink } from "../services/whatsapp";
import { transcribeAudio } from "../services/whisper";
import { logger, type LogContext } from "../utils/logger";
import { withRetry } from "../utils/retry";
import type { AudioFile, VoiceIngestResponse } from "../types";

function getIdempotencyHash(
  merchantId: string,
  parsedData: { amount: number; customer_phone: string },
  windowId: number
): string {
  return crypto
    .createHash("sha256")
    .update(
      `${merchantId}${parsedData.amount}${parsedData.customer_phone}${windowId}`
    )
    .digest("hex");
}

export async function processVoicePayment(
  merchantId: string,
  audio: AudioFile,
  ctx: LogContext
): Promise<VoiceIngestResponse> {
  const totalStartedAt = Date.now();

  logger.info("Audio file received", ctx, {
    filename: audio.filename,
    mimeType: audio.mimeType,
    sizeBytes: audio.buffer.length,
  });

  const whisperStartedAt = Date.now();
  const transcript = await transcribeAudio(audio);
  const whisperMs = Date.now() - whisperStartedAt;
  logger.info("Whisper complete", ctx, {
    transcript,
    duration_ms: whisperMs,
  });

  const geminiStartedAt = Date.now();
  const parsedData = await withRetry(() => parseIntent(transcript));
  const geminiMs = Date.now() - geminiStartedAt;
  logger.info("Gemini parsed", ctx, {
    amount: parsedData.amount,
    customer_phone: parsedData.customer_phone,
    description: parsedData.description,
    duration_ms: geminiMs,
  });

  const windowId = Math.floor(Date.now() / 30000);
  const idempotencyHash = getIdempotencyHash(merchantId, parsedData, windowId);
  const cachedResponse = await getCachedResponse(idempotencyHash);
  if (cachedResponse) {
    logger.info("Returning cached response", ctx);
    return cachedResponse;
  }

  const reference = `gp_${Date.now()}`;
  ctx.transactionId = reference;
  await createTransaction(reference, parsedData, merchantId);

  const koraStartedAt = Date.now();
  const koraCharge = await initializeKoraCharge(parsedData, reference, ctx);
  const koraMs = Date.now() - koraStartedAt;
  logger.info("Kora initialized", ctx, {
    reference: koraCharge.reference,
    checkout_url: koraCharge.checkoutUrl,
    duration_ms: koraMs,
  });

  sendWhatsAppPaymentLink(parsedData, koraCharge.checkoutUrl, ctx).catch(
    (error) => {
      logger.error("WhatsApp background send failed", ctx, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  );

  logger.info("voiceIngest complete", ctx, {
    whisper_ms: whisperMs,
    gemini_ms: geminiMs,
    kora_ms: koraMs,
    total_ms: Date.now() - totalStartedAt,
  });

  const response: VoiceIngestResponse = {
    status: "success",
    payload: {
      kora_url: koraCharge.checkoutUrl,
      whatsapp_sent: false,
      parsed_data: {
        amount: parsedData.amount,
        customer: parsedData.customer_phone,
        item: parsedData.description,
      },
      audio_feedback_url: "",
    },
  };

  await saveCachedResponse(idempotencyHash, response);
  return response;
}
