/**
 * Supabase-js wraps a browser fetch() failure (dropped connection, no
 * response at all) as `${fetchError.name}: ${fetchError.message}`
 * (@supabase/postgrest-js's PostgrestBuilder.then()), which for a network
 * drop is always `TypeError: Failed to fetch`. This project's mutations.ts
 * re-wraps that again with a context prefix, so match the substring rather
 * than the whole message. A real Postgres/RLS error never contains this
 * substring, so it's never mistaken for a retryable network blip.
 */
export function isNetworkFetchError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("TypeError:");
}

const BASE_DELAY_MS = 300;

/**
 * Retries `fn` on a transient network-layer failure only, with exponential
 * backoff (300ms, 600ms, ...). Never retries a real Postgres/RLS error --
 * that won't succeed on a second attempt, and retrying it just delays
 * surfacing a real problem. `toggleTick`'s upsert/delete are both naturally
 * idempotent (re-upserting the same tick, or deleting an already-deleted
 * one, both succeed harmlessly), so re-running the whole `fn` on retry is
 * safe -- no partial-state risk to guard against.
 */
export async function withNetworkRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !isNetworkFetchError(error)) throw error;
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
}
