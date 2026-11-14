import { NextResponse } from "next/server";

/**
 * A small per-key sliding-window rate limiter.
 *
 * Why it exists: every route that spends a paid quota (a model call, a places
 * search) is gated only by "signed in", and an account is free. Anyone with
 * one could otherwise hold that quota open in a loop. This puts a ceiling on
 * one person without getting in the way of real use.
 *
 * What it is not: a distributed limiter. State lives in this process's memory,
 * so on a serverless host each instance counts separately and a cold start
 * resets the count. That makes it best-effort protection against runaway
 * loops and casual abuse, not a guarantee — and the cost of being wrong is
 * bounded by the providers' own quotas (the model's, Google Places'). It also
 * counts per account, and accounts are free, so it slows one person down
 * rather than stopping someone who makes many. A hard guarantee would need a
 * shared store (Redis, Firestore), which this project deliberately doesn't
 * have a server tier for.
 */

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export interface RateLimiter {
  /** Records one attempt for `key` and says whether it is allowed. */
  check(key: string): RateLimitResult;
}

export function createRateLimiter(options: {
  /** Attempts allowed per window. */
  limit: number;
  windowMs: number;
  /** Injectable clock for tests. */
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs } = options;
  const now = options.now ?? Date.now;
  const attempts = new Map<string, number[]>();

  // Without this the map would grow by one entry per distinct user, forever.
  function sweep(at: number) {
    for (const [key, times] of attempts) {
      if (times.length === 0 || at - times[times.length - 1] >= windowMs) attempts.delete(key);
    }
  }

  return {
    check(key) {
      const at = now();
      const recent = (attempts.get(key) ?? []).filter((time) => at - time < windowMs);

      if (recent.length >= limit) {
        attempts.set(key, recent);
        // Free again once the oldest attempt in the window ages out.
        const retryAfterMs = windowMs - (at - recent[0]);
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }

      recent.push(at);
      attempts.set(key, recent);
      if (attempts.size > 500) sweep(at);
      return { ok: true };
    },
  };
}

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * How much each rate-limited route allows one signed-in person, all in one
 * place so they can be compared. Every limit is far above what a real person
 * does by hand, and each route counts on its own, so searching for places
 * never uses up the allowance for creating a trip.
 */
export const RATE_LIMITS = {
  /** A model call per message. 20 is plenty for a real conversation. */
  travisChat: { limit: 20, windowMs: TEN_MINUTES },
  /** A model call, and maybe place searches, per request: a lively editing session, not a script. */
  tripAgent: { limit: 30, windowMs: TEN_MINUTES },
  /** A model call per trip created. */
  tripPlan: { limit: 10, windowMs: TEN_MINUTES },
  /** Four place searches per city of every trip created: the most expensive request there is. */
  tripGenerate: { limit: 10, windowMs: TEN_MINUTES },
  /** Place searches for the new cities, each time a traveller saves a change to a trip's cities. */
  tripRebuild: { limit: 20, windowMs: TEN_MINUTES },
  /** One place search each time a traveller looks for a real place to replace an activity with. */
  placeSearch: { limit: 30, windowMs: TEN_MINUTES },
} as const;

/** "in 45 seconds", "in a minute", "in 4 minutes". Rounded up, so it never promises too early. */
export function waitInWords(seconds: number): string {
  if (seconds < 60) return seconds === 1 ? "in 1 second" : `in ${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "in a minute" : `in ${minutes} minutes`;
}

/**
 * The answer to a request the limiter refused: 429, with how long to wait
 * both in the body (for the app) and in the standard `Retry-After` header.
 * `error` is shown to the traveller as it is, so it says what to do.
 */
export function rateLimitedResponse(retryAfterSeconds: number, error: string): NextResponse {
  return NextResponse.json(
    { error, code: "rate-limited", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}
