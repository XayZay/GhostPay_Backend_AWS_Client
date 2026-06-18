/**
 * DynamoDB operations for the GhostPayMerchants table.
 *
 * Replaces all Firestore merchants collection operations.
 * Uses UpdateCommand for upsert/merge behavior (equivalent to Firestore set+merge).
 */
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, MERCHANTS_TABLE } from "./client";
import type { MerchantRecord } from "../types";

/**
 * Create or update a merchant record (merge behavior).
 */
export async function upsertMerchant(
  merchantId: string,
  data: { name: string; phone: string }
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: MERCHANTS_TABLE,
      Key: { merchantId },
      UpdateExpression:
        "SET #n = :name, phone = :phone, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#n": "name" },
      ExpressionAttributeValues: {
        ":name": data.name,
        ":phone": data.phone,
        ":updatedAt": new Date().toISOString(),
      },
    })
  );
}

/**
 * Get a merchant by ID.
 */
export async function getMerchant(
  merchantId: string
): Promise<MerchantRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: MERCHANTS_TABLE,
      Key: { merchantId },
    })
  );
  return (result.Item as MerchantRecord) ?? null;
}

/**
 * Save payout bank details for a merchant.
 */
export async function savePayoutDetails(
  merchantId: string,
  details: { accountNumber: string; bankCode: string; accountName: string }
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: MERCHANTS_TABLE,
      Key: { merchantId },
      UpdateExpression:
        "SET payoutAccountNumber = :acct, payoutBankCode = :bank, payoutAccountName = :acctName, onboardingComplete = :complete, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":acct": details.accountNumber,
        ":bank": details.bankCode,
        ":acctName": details.accountName,
        ":complete": true,
        ":updatedAt": new Date().toISOString(),
      },
    })
  );
}

/**
 * Save or update FCM token for push notifications.
 */
export async function saveFcmToken(
  merchantId: string,
  fcmToken: string
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: MERCHANTS_TABLE,
      Key: { merchantId },
      UpdateExpression: "SET fcmToken = :token, fcmUpdatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":token": fcmToken,
        ":updatedAt": new Date().toISOString(),
      },
    })
  );
}
