/**
 * OpenAI Whisper transcription service.
 *
 * Includes .aac → .m4a format normalization for Android recordings.
 * Wrapped in withRetry for resilience.
 */
import FormData from "form-data";
import fetch from "node-fetch";
import { getSecret } from "./secrets";
import { withRetry } from "../utils/retry";
import type { AudioFile } from "../types";

/** Whisper prompt tuned for Nigerian speech patterns */
const WHISPER_PROMPT =
  "Charge, pay, send money, Naira, NGN, " +
  "Oga, Madam, Abeg, transfer, " +
  "one thousand, two thousand, five hundred, " +
  "08031234567, 09012345678, 07061234567";

/** Map unsupported audio extensions to Whisper-compatible ones */
const EXTENSION_MAP: Record<string, { ext: string; mime: string }> = {
  ".aac": { ext: ".m4a", mime: "audio/mp4" },
  ".amr": { ext: ".mp3", mime: "audio/mpeg" },
  ".3gp": { ext: ".mp4", mime: "audio/mp4" },
};

/**
 * Transcribe audio using OpenAI Whisper API.
 */
export async function transcribeAudio(audio: AudioFile): Promise<string> {
  const secretName = process.env.OPENAI_SECRET_NAME ?? "ghostpay/openai";
  const apiKey = await getSecret(secretName);

  return withRetry(async () => {
    const form = new FormData();

    // Normalize unsupported audio formats for Whisper
    let filename = audio.filename;
    let contentType = audio.mimeType;
    const dotIndex = filename.lastIndexOf(".");
    const originalExt =
      dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
    const mapped = EXTENSION_MAP[originalExt];
    if (mapped) {
      filename = filename.slice(0, dotIndex) + mapped.ext;
      contentType = mapped.mime;
    }

    form.append("file", audio.buffer, { filename, contentType });
    form.append("model", "whisper-1");
    form.append("language", "en");
    form.append("prompt", WHISPER_PROMPT);

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Whisper API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as { text: string };
    return data.text;
  });
}
