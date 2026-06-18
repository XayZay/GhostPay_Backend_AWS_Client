/**
 * JWT authentication middleware for Lambda handlers.
 *
 * Replaces the Firebase requireJwt / getMerchantIdFromRequest functions.
 * JWT_SECRET is fetched from AWS Secrets Manager (cached).
 */
import jwt from "jsonwebtoken";
import { getSecret } from "../services/secrets";
import { logger, LogContext } from "../utils/logger";
import type { AdaptedRequest, AdaptedResponse, JwtMerchantPayload } from "../types";

/**
 * Get the Bearer token from the Authorization header.
 */
function getBearerToken(req: AdaptedRequest): string {
  const authHeader = req.header("authorization");
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

/**
 * Verify a JWT and return the payload.
 * Throws if the token is invalid or expired.
 */
async function verifyJwt(token: string): Promise<JwtMerchantPayload> {
  const secretName = process.env.JWT_SECRET_NAME ?? "ghostpay/jwt";
  const secret = await getSecret(secretName);
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === "string") {
    throw new Error("Invalid JWT payload format");
  }
  return decoded as JwtMerchantPayload;
}

/**
 * Require a valid JWT. Sends 401/500 response and returns false on failure.
 * Returns true if JWT is valid.
 */
export async function requireJwt(
  req: AdaptedRequest,
  res: AdaptedResponse,
  ctx?: Partial<LogContext>
): Promise<boolean> {
  try {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "unauthorized", message: "Bearer token required" });
      return false;
    }
    await verifyJwt(token);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("JWT verification failed", ctx, { error: message });
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
}

/**
 * Extract the merchantId from the JWT payload.
 * Returns null if extraction fails.
 */
export async function getMerchantId(
  req: AdaptedRequest,
  ctx?: Partial<LogContext>
): Promise<string | null> {
  try {
    const token = getBearerToken(req);
    if (!token) return null;
    const payload = await verifyJwt(token);
    return payload.merchantId ?? payload.phone ?? payload.sub ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("JWT merchant extraction failed", ctx, { error: message });
    return null;
  }
}

/**
 * Sign a new JWT for a merchant.
 */
export async function signMerchantToken(
  merchantId: string,
  phone: string
): Promise<string> {
  const secretName = process.env.JWT_SECRET_NAME ?? "ghostpay/jwt";
  const secret = await getSecret(secretName);
  return jwt.sign({ merchantId, phone }, secret, { expiresIn: "30d" });
}
