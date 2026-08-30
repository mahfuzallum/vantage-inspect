import "server-only";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Unix ms at which the current window resets. */
  resetAt: number;
};

export type RateLimitRule = {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

/**
 * Storage contract for counters. The in-memory store below is correct for a
 * single instance; swap in a Redis-backed store for multi-instance deploys
 * without touching call sites.
 */
export interface RateLimitStore {
  readonly id: string;
  /** True when the backend is shared across instances. */
  readonly distributed: boolean;
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

class MemoryRateLimitStore implements RateLimitStore {
  readonly id = "memory";
  readonly distributed = false;
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      if (this.buckets.size > 10_000) this.evictExpired(now);
      return fresh;
    }
    existing.count += 1;
    return existing;
  }

  private evictExpired(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Redis-backed counters.
 *
 * Not implemented: no Redis client is a dependency of this project, and
 * adding one along with credentials that are not configured would be worse
 * than the honest gap. The class exists so the shape of the work is visible
 * and the factory can route to it.
 *
 * The implementation is small — INCR the key, EXPIRE it on first write, return
 * the count and TTL — and nothing outside this file changes when it lands.
 */
class RedisRateLimitStore implements RateLimitStore {
  readonly id = "redis";
  readonly distributed = true;

  async increment(): Promise<{ count: number; resetAt: number }> {
    throw new Error(
      "RATE_LIMIT_STORE=redis is selected but RedisRateLimitStore is not implemented. " +
        "Install a Redis client and complete it, or set RATE_LIMIT_STORE=memory.",
    );
  }
}

function selectStore(): RateLimitStore {
  if (process.env.RATE_LIMIT_STORE === "redis") return new RedisRateLimitStore();
  return new MemoryRateLimitStore();
}

/**
 * The active store.
 *
 * In-process by default. That is correct for a single instance and wrong for
 * several: each replica keeps its own counters, so the effective limit
 * multiplies by the replica count. A distributed store is required before
 * horizontal scaling — see SECURITY.md.
 */
const store: RateLimitStore = selectStore();

/** Lets an operator confirm which backend is live. */
export function rateLimitBackend(): { id: string; distributed: boolean } {
  return { id: store.id, distributed: store.distributed };
}

/** Named rules keep limits declarative and reviewable in one place. */
export const RATE_LIMITS = {
  login: { limit: 5, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 3, windowMs: 60 * 60_000 },
  passwordChange: { limit: 5, windowMs: 30 * 60_000 },
  emailChange: { limit: 3, windowMs: 60 * 60_000 },
  accountDelete: { limit: 3, windowMs: 60 * 60_000 },
  upload: { limit: 40, windowMs: 60 * 60_000 },
  // Saving is cheap but writes a row and bumps a counter; a loop should not
  // be able to inflate favourite counts or churn the table.
  favorite: { limit: 120, windowMs: 60 * 60_000 },
  // View tracking is already de-duplicated per viewer for 30 minutes; this is
  // a second ceiling against a client firing the action in a loop.
  viewTracking: { limit: 300, windowMs: 60 * 60_000 },
  uploadAuthorize: { limit: 60, windowMs: 60 * 60_000 },
  search: { limit: 60, windowMs: 60_000 },
  report: { limit: 10, windowMs: 60 * 60_000 },
  api: { limit: 120, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

export async function rateLimit(name: RateLimitName, identifier: string): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[name];
  const { count, resetAt } = await store.increment(`${name}:${identifier}`, rule.windowMs);
  return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count), resetAt };
}

/** Best-effort client identifier from proxy headers. */
export function clientIdentifier(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return headers.get("x-real-ip") ?? "unknown";
}
