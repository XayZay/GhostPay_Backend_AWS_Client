/**
 * Retry utility with exponential backoff and jitter.
 *
 * Applied to external API calls (Whisper, Gemini, Kora, WhatsApp, YarnGPT).
 * NOT applied to webhook handlers or idempotent DynamoDB writes.
 */

export interface RetryOptions {
  /** Maximum number of retries after the first attempt. Default: 3 */
  maxRetries: number;
  /** Base delay in ms before first retry. Default: 200 */
  baseDelayMs: number;
  /** Maximum delay cap in ms. Default: 5000 */
  maxDelayMs: number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute `fn` with retry on failure.
 *
 * Uses exponential backoff: delay = min(baseDelay * 2^attempt + jitter, maxDelay)
 *
 * @example
 * const result = await withRetry(() => callWhisperApi(audio));
 * const result = await withRetry(() => callKoraApi(data), { maxRetries: 2 });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === opts.maxRetries) {
        break;
      }

      // Exponential backoff with random jitter to avoid thundering herd
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt) +
          Math.random() * opts.baseDelayMs,
        opts.maxDelayMs
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
