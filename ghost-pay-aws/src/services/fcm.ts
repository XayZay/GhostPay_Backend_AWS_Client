/**
 * Direct FCM HTTP v1 API push notifications.
 *
 * Replaces firebase-admin messaging. Uses a Google Service Account
 * JSON key (stored in Secrets Manager) to generate OAuth2 access tokens.
 */
import { GoogleAuth } from "google-auth-library";
import { getSecret } from "./secrets";
import { logger, LogContext } from "../utils/logger";
import { withRetry } from "../utils/retry";
import fetch from "node-fetch";

const FCM_SCOPES = ["https://www.googleapis.com/auth/firebase.messaging"];

let cachedAuth: GoogleAuth | null = null;

/**
 * Get or create a GoogleAuth instance from the service account in Secrets Manager.
 */
async function getAuth(): Promise<GoogleAuth> {
  if (cachedAuth) {
    return cachedAuth;
  }

  const secretName = process.env.GOOGLE_SA_SECRET_NAME ?? "ghostpay/google-sa";
  const saJson = await getSecret(secretName);
  const credentials = JSON.parse(saJson);

  cachedAuth = new GoogleAuth({
    credentials,
    scopes: FCM_SCOPES,
  });

  return cachedAuth;
}

/**
 * Send a data-only push notification via FCM HTTP v1 API.
 */
export async function sendPushNotification(
  fcmToken: string,
  data: Record<string, string>,
  ctx?: Partial<LogContext>
): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    logger.warn("FIREBASE_PROJECT_ID not set; skipping push notification", ctx);
    return;
  }

  await withRetry(async () => {
    const auth = await getAuth();
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse?.token;

    if (!accessToken) {
      throw new Error("Failed to obtain OAuth2 access token for FCM");
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            data,
            android: {
              priority: "high",
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`FCM API error ${response.status}: ${body}`);
    }

    logger.info("FCM push notification sent", ctx, { fcmToken: fcmToken.slice(0, 20) + "..." });
  });
}
