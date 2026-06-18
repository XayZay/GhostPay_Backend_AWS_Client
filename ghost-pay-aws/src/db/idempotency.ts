/**
 * DynamoDB idempotency cache with TTL auto-cleanup.
 *
 * Replaces the Firestore idempotency collection.
 * DynamoDB TTL automatically deletes expired entries — no manual cleanup needed.
 */
import { PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, IDEMPOTENCY_TABLE } from "./client";
import type { VoiceIngestResponse } from "../types";

/** Response is considered fresh for 60 seconds */
const CACHE_WINDOW_MS = 60 * 1000;

/** DynamoDB TTL: auto-delete after 5 minutes */
const TTL_SECONDS = 5 * 60;

/**
 * Check for a cached voice ingest response.
 * Returns null if no cache entry exists or if it's older than 60 seconds.
 */
export async function getCachedResponse(
  hash: string
): Promise<VoiceIngestResponse | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: IDEMPOTENCY_TABLE,
      Key: { hash },
    })
  );

  if (!result.Item) {
    return null;
  }

  const createdAt = result.Item.createdAt as string | undefined;
  const response = result.Item.response as VoiceIngestResponse | undefined;

  if (!createdAt || !response) {
    return null;
  }

  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs < CACHE_WINDOW_MS ? response : null;
}

/**
 * Save a voice ingest response to the idempotency cache.
 * DynamoDB TTL will auto-delete this entry after 5 minutes.
 */
export async function saveCachedResponse(
  hash: string,
  response: VoiceIngestResponse
): Promise<void> {
  const now = new Date();
  await docClient.send(
    new PutCommand({
      TableName: IDEMPOTENCY_TABLE,
      Item: {
        hash,
        response,
        createdAt: now.toISOString(),
        ttl: Math.floor(now.getTime() / 1000) + TTL_SECONDS,
      },
    })
  );
}
