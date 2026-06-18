/**
 * Structured JSON logger with request correlation.
 *
 * Every log line is emitted as a single JSON object so CloudWatch Logs
 * Insights can query by requestId, merchantId, operation, etc.
 */
import * as crypto from "crypto";

export interface LogContext {
  requestId: string;
  merchantId?: string;
  transactionId?: string;
}

/**
 * Create a new request context with a unique requestId.
 * Call this once at the start of each Lambda invocation.
 */
export function createRequestContext(merchantId?: string): LogContext {
  return {
    requestId: crypto.randomUUID(),
    merchantId,
  };
}

function formatLog(
  level: string,
  message: string,
  ctx?: Partial<LogContext>,
  data?: Record<string, unknown>
): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...ctx,
    ...data,
  });
}

export const logger = {
  info(
    message: string,
    ctx?: Partial<LogContext>,
    data?: Record<string, unknown>
  ): void {
    console.log(formatLog("INFO", message, ctx, data));
  },

  warn(
    message: string,
    ctx?: Partial<LogContext>,
    data?: Record<string, unknown>
  ): void {
    console.warn(formatLog("WARN", message, ctx, data));
  },

  error(
    message: string,
    ctx?: Partial<LogContext>,
    data?: Record<string, unknown>
  ): void {
    console.error(formatLog("ERROR", message, ctx, data));
  },
};
