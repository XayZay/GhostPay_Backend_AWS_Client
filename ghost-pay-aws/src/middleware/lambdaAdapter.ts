/**
 * Lambda Adapter — converts API Gateway v2 events into Express-like
 * request/response objects.
 *
 * This minimizes rewrites of the original Firebase Cloud Functions
 * handler logic, which uses (req, res) pattern.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { AdaptedRequest, AdaptedResponse } from "../types";

/**
 * Build an Express-like request from an API Gateway v2 event.
 */
function buildRequest(event: APIGatewayProxyEventV2): AdaptedRequest {
  // Decode body (API Gateway may base64-encode binary payloads)
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? "", "base64")
    : Buffer.from(event.body ?? "", "utf8");

  // Parse JSON body (if applicable)
  let body: Record<string, unknown> = {};
  const contentType = (
    event.headers?.["content-type"] ?? ""
  ).toLowerCase();
  if (contentType.includes("application/json") && rawBody.length > 0) {
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      // Leave body as empty object if JSON parse fails (multipart, etc.)
    }
  }

  // Lowercase all headers for consistent access
  const headers: Record<string, string | undefined> = {};
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      headers[key.toLowerCase()] = value;
    }
  }

  return {
    method: event.requestContext?.http?.method ?? "POST",
    headers,
    body,
    rawBody,
    header: (name: string) => headers[name.toLowerCase()] ?? "",
  };
}

/**
 * Build an Express-like response object that accumulates the reply.
 */
function buildResponse(): AdaptedResponse {
  const res: AdaptedResponse = {
    statusCode: 200,
    responseHeaders: { "Content-Type": "application/json" },
    responseBody: "",
    sent: false,

    status(code: number) {
      res.statusCode = code;
      return res;
    },

    json(data: unknown) {
      res.responseBody = JSON.stringify(data);
      res.sent = true;
    },

    set(key: string, value: string) {
      res.responseHeaders[key] = value;
      return res;
    },
  };
  return res;
}

/**
 * Convert the adapted response to an API Gateway v2 result.
 */
function toApiGatewayResult(res: AdaptedResponse): APIGatewayProxyResultV2 {
  return {
    statusCode: res.statusCode,
    headers: res.responseHeaders,
    body: res.responseBody,
  };
}

/**
 * Create a Lambda handler from an Express-style async handler function.
 *
 * @example
 * export const handler = createHandler(async (req, res) => {
 *   const body = req.body;
 *   res.status(200).json({ ok: true });
 * });
 */
export function createHandler(
  fn: (req: AdaptedRequest, res: AdaptedResponse) => Promise<void>
): (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> {
  return async (
    event: APIGatewayProxyEventV2
  ): Promise<APIGatewayProxyResultV2> => {
    const req = buildRequest(event);
    const res = buildResponse();

    try {
      await fn(req, res);
    } catch (error) {
      // If the handler didn't send a response yet, send a 500
      if (!res.sent) {
        const message =
          error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: "internal_error", message });
      }
    }

    return toApiGatewayResult(res);
  };
}
