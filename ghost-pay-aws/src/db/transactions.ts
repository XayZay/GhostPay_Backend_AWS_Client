/**
 * DynamoDB operations for the GhostPayTransactions table.
 *
 * Replaces all Firestore transactions collection operations.
 */
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { docClient, TRANSACTIONS_TABLE } from "./client";
import type { ParsedPaymentData, TransactionRecord } from "../types";

/**
 * Create a new pending transaction.
 */
export async function createTransaction(
  reference: string,
  parsedData: ParsedPaymentData,
  merchantId?: string
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TRANSACTIONS_TABLE,
      Item: {
        reference,
        status: "pending",
        amount: parsedData.amount,
        customer: parsedData.customer_phone,
        item: parsedData.description,
        merchantId,
        createdAt: new Date().toISOString(),
      },
    })
  );
}

/**
 * Get a transaction by reference.
 */
export async function getTransaction(
  reference: string
): Promise<TransactionRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TRANSACTIONS_TABLE,
      Key: { reference },
    })
  );
  return (result.Item as TransactionRecord) ?? null;
}

/**
 * Mark a transaction as paid.
 */
export async function markTransactionPaid(reference: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TRANSACTIONS_TABLE,
      Key: { reference },
      UpdateExpression: "SET #s = :status, paidAt = :paidAt",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": "paid",
        ":paidAt": new Date().toISOString(),
      },
    })
  );
}

/**
 * Mark a transaction as failed.
 */
export async function markTransactionFailed(reference: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TRANSACTIONS_TABLE,
      Key: { reference },
      UpdateExpression: "SET #s = :status, failedAt = :failedAt",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": "failed",
        ":failedAt": new Date().toISOString(),
      },
    })
  );
}

/**
 * Upsert a paid transaction from a webhook event (when local record doesn't exist).
 */
export async function upsertPaidTransaction(
  reference: string,
  eventData: Record<string, unknown>
): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: TRANSACTIONS_TABLE,
      Item: {
        reference,
        ...eventData,
        status: "paid",
        paidAt: new Date().toISOString(),
      },
    })
  );
}

/**
 * Query pending transactions created before the given cutoff time.
 * Uses the StatusCreatedAtIndex GSI.
 */
export async function getPendingTransactionsBefore(
  cutoffIso: string
): Promise<TransactionRecord[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TRANSACTIONS_TABLE,
      IndexName: "StatusCreatedAtIndex",
      KeyConditionExpression: "#s = :status AND createdAt < :cutoff",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": "pending",
        ":cutoff": cutoffIso,
      },
    })
  );
  return (result.Items as TransactionRecord[]) ?? [];
}
