/**
 * Shared TypeScript interfaces for Ghost Pay AWS.
 * Extracted from the original Firebase index.ts.
 */

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export interface AudioFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export interface YarnGptAudioResponse {
  buffer: Buffer;
  contentType: string;
}

// ---------------------------------------------------------------------------
// Kora
// ---------------------------------------------------------------------------

export interface KoraCharge {
  checkoutUrl: string;
  reference: string;
}

export interface KoraChargeStatus {
  status?: string;
  [key: string]: unknown;
}

export interface KoraEvent {
  data?: {
    reference?: string;
    transaction_reference?: string;
    status?: string;
    merchantId?: string;
    merchant_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Gemini / Whisper
// ---------------------------------------------------------------------------

export interface ParsedPaymentData {
  amount: number;
  description: string;
  customer_phone: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface JwtMerchantPayload {
  merchantId?: string;
  phone?: string;
  sub?: string;
  iat?: number;
  exp?: number;
}

// ---------------------------------------------------------------------------
// API Responses
// ---------------------------------------------------------------------------

export interface VoiceIngestResponse {
  status: "success";
  payload: {
    kora_url: string;
    whatsapp_sent: boolean;
    parsed_data: {
      amount: number;
      customer: string;
      item: string;
    };
    audio_feedback_url: string;
  };
}

// ---------------------------------------------------------------------------
// Database Records
// ---------------------------------------------------------------------------

export interface TransactionRecord {
  reference?: string;
  amount?: number;
  customer?: string;
  item?: string;
  merchantId?: string;
  status?: string;
  createdAt?: string;
  paidAt?: string;
  failedAt?: string;
  [key: string]: unknown;
}

export interface MerchantRecord {
  merchantId: string;
  name?: string;
  phone?: string;
  fcmToken?: string;
  payoutAccountNumber?: string;
  payoutBankCode?: string;
  payoutAccountName?: string;
  onboardingComplete?: boolean;
  updatedAt?: string;
  fcmUpdatedAt?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Lambda Adapter
// ---------------------------------------------------------------------------

export interface AdaptedRequest {
  method: string;
  headers: Record<string, string | undefined>;
  body: Record<string, unknown>;
  rawBody: Buffer;
  /** Convenience: req.header("name") with case-insensitive lookup */
  header: (name: string) => string;
}

export interface AdaptedResponse {
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: string;
  /** Set status code. Chainable. */
  status: (code: number) => AdaptedResponse;
  /** Send JSON response. Terminal. */
  json: (data: unknown) => void;
  /** Set response header. Chainable. */
  set: (key: string, value: string) => AdaptedResponse;
  /** Whether json() has been called. */
  sent: boolean;
}
