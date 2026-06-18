/**
 * DynamoDB Document Client singleton.
 *
 * All database modules import from here to share a single client instance.
 * Table names are read from Lambda environment variables with sensible defaults.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const rawClient = new DynamoDBClient({});

export const docClient = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Table names from environment variables (set by SAM template)
export const TRANSACTIONS_TABLE =
  process.env.TRANSACTIONS_TABLE ?? "GhostPayTransactions";
export const MERCHANTS_TABLE =
  process.env.MERCHANTS_TABLE ?? "GhostPayMerchants";
export const IDEMPOTENCY_TABLE =
  process.env.IDEMPOTENCY_TABLE ?? "GhostPayIdempotency";
