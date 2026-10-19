export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window limiter for one HTTP process.
 *
 * This is an abuse-control measure for a single-instance deployment, not a
 * distributed quota system. Buckets are deliberately bounded so the limiter
 * itself cannot become an unbounded memory store.
 */
export class FixedWindowRateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxBuckets: number;

  constructor(limit: number, windowMs = 60_000, maxBuckets = 10_000) {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error("Rate limit must be a non-negative integer.");
    }
    if (!Number.isInteger(windowMs) || windowMs < 1) {
      throw new Error("Rate limit window must be a positive integer.");
    }
    if (!Number.isInteger(maxBuckets) || maxBuckets < 1) {
      throw new Error("Rate limit bucket capacity must be a positive integer.");
    }
    this.#limit = limit;
    this.#windowMs = windowMs;
    this.#maxBuckets = maxBuckets;
  }

  get enabled(): boolean {
    return this.#limit > 0;
  }

  consume(key: string, now = Date.now()): RateLimitResult {
    if (!this.enabled) return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0 };

    const bucketKey = key.trim() || "unknown";
    let bucket = this.#buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.#windowMs };
      this.#buckets.set(bucketKey, bucket);
      this.#prune(now);
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    if (bucket.count >= this.#limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, this.#limit - bucket.count),
      retryAfterSeconds: 0,
    };
  }

  #prune(now: number): void {
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAt <= now) this.#buckets.delete(key);
      if (this.#buckets.size <= this.#maxBuckets) break;
    }
    while (this.#buckets.size > this.#maxBuckets) {
      const oldest = this.#buckets.keys().next().value;
      if (oldest === undefined) break;
      this.#buckets.delete(oldest);
    }
  }
}
