/**
 * Lambda: voiceIngest
 *
 * Main voice-to-payment pipeline.
 * POST (multipart audio) -> Whisper -> Gemini -> Kora -> WhatsApp
 */
import Busboy from "busboy";
import { processVoicePayment } from "../application/voicePayments";
import { requireJwt, getMerchantId } from "../middleware/auth";
import { createHandler } from "../middleware/lambdaAdapter";
import { createRequestContext, logger } from "../utils/logger";
import type { AudioFile } from "../types";

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

export const handler = createHandler(async (req, res) => {
  const ctx = createRequestContext();

  if (req.method !== "POST") {
    res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" });
    return;
  }

  if (!(await requireJwt(req, res, ctx))) return;

  const merchantId = await getMerchantId(req, ctx);
  if (!merchantId) {
    res.status(401).json({ error: "merchant_id_required" });
    return;
  }
  ctx.merchantId = merchantId;

  try {
    const audio = await parseMultipart(req.rawBody, req.header("content-type"));
    const response = await processVoicePayment(merchantId, audio, ctx);
    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("voiceIngest failed", ctx, { error: message });
    res.status(500).json({ status: "error", message });
  }
});
