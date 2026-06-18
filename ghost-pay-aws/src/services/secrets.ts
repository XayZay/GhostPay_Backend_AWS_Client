/**
 * AWS Secrets Manager client with in-memory caching.
 *
 * Secrets are cached for 5 minutes to avoid excessive API calls.
 * Lambda cold starts naturally clear the cache since module-level
 * state is re-initialized.
 */
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});

interface CachedSecret {
  value: string;
  expiresAt: number;
}

const cache = new Map<string, CachedSecret>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a secret value from AWS Secrets Manager with in-memory caching.
 */
export async function getSecret(secretName: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(secretName);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  const value = response.SecretString;

  if (!value) {
    throw new Error(`Secret ${secretName} has no string value`);
  }

  cache.set(secretName, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Get a JSON secret and parse it.
 */
export async function getJsonSecret<T>(secretName: string): Promise<T> {
  const raw = await getSecret(secretName);
  return JSON.parse(raw) as T;
}

/**
 * Clear the secrets cache. Useful for testing.
 */
export function clearSecretsCache(): void {
  cache.clear();
}
