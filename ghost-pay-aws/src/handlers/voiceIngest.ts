/**
 * Lambda: voiceIngest
 *
 * Main voice-to-payment pipeline.
 * POST (multipart audio) → Whisper → Gemini → Kora → WhatsApp
 *
 * This is the most complex handler — 512MB RAM, 90s timeout.
 */
import * as crypto from "crypto";
import Busboy from "busboy";
import { createHandler } from "../middleware/lambdaAdapter";
import { requireJwt, getMerchantId } from "../middleware/auth";
import { transcribeAudio } from "../services/whisper";
import { initializeKoraCharge } from "../services/kora";
import { sendWhatsAppPaymentLink } from "../services/whatsapp";
import { parseIntent } from "../geminiParser";
import { createTransaction } from "../db/transactions";
import {
  getCachedResponse,
  saveCachedResponse,
} from "../db/idempotency";
import { logger, createRequestContext } from "../utils/logger";
import { withRetry } from "../utils/retry";
import type { AudioFile, VoiceIngestResponse } from "../types";

/**
 * Parse multipart form data to extract the audio file.
 */
function parseMultipart(
  rawBody: Buffer,
  contentType: string
): Promise<AudioFile> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: { "content-type": contentType } });
    const chunks: Buffer[] = [];
    let filename = "audio.m4a";
    let mimeType = "audio/mp4";

    busboy.on("file", (_field, stream, info) => {
      filename = info.filename ?? filename;
      mimeType = info.mimeType ?? mimeType;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    });

    busboy.on("finish", () => {
      if (chunks.length === 0) {
        reject(new Error("No audio file found in request"));
        return;
      }
      resolve({
        buffer: Buffer.concat(chunks),
        filename,
        mimeType,
      });
    });

    busboy.on("error", reject);
    busboy.end(rawBody);
  });
}

/**
 * Compute idempotency hash for deduplication.
 */
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

export const handler = createHandler(async (req, res) => {
  const ctx = createRequestContext();
  const totalStartedAt = Date.now();

  if (req.method !== "POST") {
    res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" });
    return;
  }

  // JWT auth
  if (!(await requireJwt(req, res, ctx))) return;

  const merchantId = await getMerchantId(req, ctx);
  if (!merchantId) {
    res.status(401).json({ error: "merchant_id_required" });
    return;
  }
  ctx.merchantId = merchantId;

  try {
    // 1. Parse multipart audio
    const audio = await parseMultipart(
      req.rawBody,
      req.header("content-type")
    );
    logger.info("Audio file received", ctx, {
      filename: audio.filename,
      mimeType: audio.mimeType,
      sizeBytes: audio.buffer.length,
    });

    // 2. Whisper transcription
    const whisperStartedAt = Date.now();
    const transcript = await transcribeAudio(audio);
    const whisperMs = Date.now() - whisperStartedAt;
    logger.info("Whisper complete", ctx, {
      transcript,
      duration_ms: whisperMs,
    });

    // 3. Gemini intent parsing
    const geminiStartedAt = Date.now();
    const parsedData = await withRetry(() => parseIntent(transcript));
    const geminiMs = Date.now() - geminiStartedAt;
    logger.info("Gemini parsed", ctx, {
      amount: parsedData.amount,
      customer_phone: parsedData.customer_phone,
      description: parsedData.description,
      duration_ms: geminiMs,
    });

    // 4. Idempotency check
    const windowId = Math.floor(Date.now() / 30000);
    const idempotencyHash = getIdempotencyHash(
      merchantId,
      parsedData,
      windowId
    );
    const cachedResponse = await getCachedResponse(idempotencyHash);
    if (cachedResponse) {
      logger.info("Returning cached response", ctx);
      res.status(200).json(cachedResponse);
      return;
    }

    // 5. Create transaction in DynamoDB
    const reference = `gp_${Date.now()}`;
    ctx.transactionId = reference;
    await createTransaction(reference, parsedData, merchantId);

    // 6. Initialize Kora charge
    const koraStartedAt = Date.now();
    const koraCharge = await initializeKoraCharge(parsedData, reference, ctx);
    const koraMs = Date.now() - koraStartedAt;
    logger.info("Kora initialized", ctx, {
      reference: koraCharge.reference,
      checkout_url: koraCharge.checkoutUrl,
      duration_ms: koraMs,
    });

    // 7. Send WhatsApp payment link (fire-and-forget)
    sendWhatsAppPaymentLink(parsedData, koraCharge.checkoutUrl, ctx).catch(
      (error) => {
        logger.error("WhatsApp background send failed", ctx, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    );

    // 8. Build response
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
    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("voiceIngest failed", ctx, { error: message });
    res.status(500).json({ status: "error", message });
  }
});
