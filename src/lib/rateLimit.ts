import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

type RateLimitPolicyName = "travel-updates-general" | "travel-updates-gmail-import" | "push-subscribe";

type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
  prefix: string;
};

type RateLimitDecision = {
  allowed: boolean;
  headers: Headers;
};

const RATE_LIMIT_POLICIES: Record<RateLimitPolicyName, RateLimitPolicy> = {
  "travel-updates-general": {
    limit: 10,
    windowSeconds: 10,
    prefix: "kepi:rl:travel-updates",
  },
  "travel-updates-gmail-import": {
    limit: 3,
    windowSeconds: 60,
    prefix: "kepi:rl:travel-updates:gmail-import",
  },
  "push-subscribe": {
    limit: 5,
    windowSeconds: 60,
    prefix: "kepi:rl:push-subscribe",
  },
};

type MemoryRateLimitEntry = {
  resetAtMs: number;
  count: number;
};

const memoryRateLimitStore = new Map<string, MemoryRateLimitEntry>();

const hasUpstashConfig = Boolean(
  process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
);

const upstashRedis = hasUpstashConfig ? Redis.fromEnv() : null;
const upstashLimiterByPolicy: Partial<Record<RateLimitPolicyName, Ratelimit>> = hasUpstashConfig
  ? {
      "travel-updates-general": new Ratelimit({
        redis: upstashRedis as Redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_POLICIES["travel-updates-general"].limit,
          `${RATE_LIMIT_POLICIES["travel-updates-general"].windowSeconds} s`,
        ),
        prefix: RATE_LIMIT_POLICIES["travel-updates-general"].prefix,
      }),
      "travel-updates-gmail-import": new Ratelimit({
        redis: upstashRedis as Redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_POLICIES["travel-updates-gmail-import"].limit,
          `${RATE_LIMIT_POLICIES["travel-updates-gmail-import"].windowSeconds} s`,
        ),
        prefix: RATE_LIMIT_POLICIES["travel-updates-gmail-import"].prefix,
      }),
      "push-subscribe": new Ratelimit({
        redis: upstashRedis as Redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_POLICIES["push-subscribe"].limit,
          `${RATE_LIMIT_POLICIES["push-subscribe"].windowSeconds} s`,
        ),
        prefix: RATE_LIMIT_POLICIES["push-subscribe"].prefix,
      }),
    }
  : {};

function createRateLimitHeaders(limit: number, remaining: number, resetAtMs: number): Headers {
  const headers = new Headers();
  headers.set("X-RateLimit-Limit", String(limit));
  headers.set("X-RateLimit-Remaining", String(Math.max(0, remaining)));
  headers.set("X-RateLimit-Reset", String(Math.max(0, Math.ceil(resetAtMs / 1000))));
  return headers;
}

function appendRetryAfter(headers: Headers, resetAtMs: number): void {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
  headers.set("Retry-After", String(retryAfterSeconds));
}

function applyMemoryRateLimit(policyName: RateLimitPolicyName, identifier: string): RateLimitDecision {
  const policy = RATE_LIMIT_POLICIES[policyName];
  const nowMs = Date.now();
  const windowMs = policy.windowSeconds * 1000;
  const key = `${policyName}:${identifier}`;
  const existing = memoryRateLimitStore.get(key);
  if (!existing || nowMs >= existing.resetAtMs) {
    const resetAtMs = nowMs + windowMs;
    memoryRateLimitStore.set(key, {
      count: 1,
      resetAtMs,
    });
    return {
      allowed: true,
      headers: createRateLimitHeaders(policy.limit, policy.limit - 1, resetAtMs),
    };
  }

  if (existing.count >= policy.limit) {
    const headers = createRateLimitHeaders(policy.limit, 0, existing.resetAtMs);
    appendRetryAfter(headers, existing.resetAtMs);
    return {
      allowed: false,
      headers,
    };
  }

  existing.count += 1;
  memoryRateLimitStore.set(key, existing);
  return {
    allowed: true,
    headers: createRateLimitHeaders(policy.limit, policy.limit - existing.count, existing.resetAtMs),
  };
}

export async function enforceRateLimit(options: {
  policyName: RateLimitPolicyName;
  identifier: string;
  route: string;
  requestId: string;
}): Promise<RateLimitDecision> {
  if (process.env.NODE_ENV === "test") {
    return {
      allowed: true,
      headers: new Headers(),
    };
  }

  const limiter = upstashLimiterByPolicy[options.policyName];
  if (!limiter) {
    return applyMemoryRateLimit(options.policyName, options.identifier);
  }

  try {
    const result = await limiter.limit(options.identifier);
    const headers = createRateLimitHeaders(result.limit, result.remaining, result.reset);
    if (!result.success) {
      appendRetryAfter(headers, result.reset);
      logger.withContext({
        requestId: options.requestId,
        route: options.route,
        policyName: options.policyName,
        identifier: options.identifier,
      }).warn("Rate limit exceeded.");
    }
    return {
      allowed: result.success,
      headers,
    };
  } catch (error) {
    logger.withContext({
      requestId: options.requestId,
      route: options.route,
      policyName: options.policyName,
      identifier: options.identifier,
    }).error("Rate limiting provider failed; using memory fallback.", error instanceof Error ? error : undefined);
    return applyMemoryRateLimit(options.policyName, options.identifier);
  }
}
