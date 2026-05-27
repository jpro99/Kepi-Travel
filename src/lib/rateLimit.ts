import { Ratelimit } from "@upstash/ratelimit";
import { getSafeRedisClient } from "@/lib/redis";
import { logger } from "@/lib/logger";

type RateLimitPolicyName =
  | "travel-updates-general"
  | "trips-authenticated"
  | "travel-updates-gmail-import"
  | "push-subscribe"
  | "ai-suggestions"
  | "support-chat";

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
  "trips-authenticated": {
    limit: 120,
    windowSeconds: 60,
    prefix: "kepi:rl:trips-authenticated",
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
  "ai-suggestions": {
    limit: 50,
    windowSeconds: 60 * 60,
    prefix: "kepi:rl:ai-suggestions",
  },
  "support-chat": {
    limit: 20,
    windowSeconds: 60 * 60,
    prefix: "kepi:rl:support-chat",
  },
};

type MemoryRateLimitEntry = {
  resetAtMs: number;
  count: number;
};

const memoryRateLimitStore = new Map<string, MemoryRateLimitEntry>();

let cachedLimiterByPolicy: Partial<Record<RateLimitPolicyName, Ratelimit>> | null = null;

function getUpstashRedis() {
  return getSafeRedisClient("rateLimit");
}

function getUpstashLimiterByPolicy(): Partial<Record<RateLimitPolicyName, Ratelimit>> {
  if (cachedLimiterByPolicy) {
    return cachedLimiterByPolicy;
  }
  const upstashRedis = getUpstashRedis();
  if (!upstashRedis) {
    cachedLimiterByPolicy = {};
    return cachedLimiterByPolicy;
  }
  cachedLimiterByPolicy = {
    "travel-updates-general": new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(
        RATE_LIMIT_POLICIES["travel-updates-general"].limit,
        `${RATE_LIMIT_POLICIES["travel-updates-general"].windowSeconds} s`,
      ),
      prefix: RATE_LIMIT_POLICIES["travel-updates-general"].prefix,
    }),
    "trips-authenticated": new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(
        RATE_LIMIT_POLICIES["trips-authenticated"].limit,
        `${RATE_LIMIT_POLICIES["trips-authenticated"].windowSeconds} s`,
      ),
      prefix: RATE_LIMIT_POLICIES["trips-authenticated"].prefix,
    }),
    "travel-updates-gmail-import": new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(
        RATE_LIMIT_POLICIES["travel-updates-gmail-import"].limit,
        `${RATE_LIMIT_POLICIES["travel-updates-gmail-import"].windowSeconds} s`,
      ),
      prefix: RATE_LIMIT_POLICIES["travel-updates-gmail-import"].prefix,
    }),
    "push-subscribe": new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(
        RATE_LIMIT_POLICIES["push-subscribe"].limit,
        `${RATE_LIMIT_POLICIES["push-subscribe"].windowSeconds} s`,
      ),
      prefix: RATE_LIMIT_POLICIES["push-subscribe"].prefix,
    }),
    "ai-suggestions": new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(
        RATE_LIMIT_POLICIES["ai-suggestions"].limit,
        `${RATE_LIMIT_POLICIES["ai-suggestions"].windowSeconds} s`,
      ),
      prefix: RATE_LIMIT_POLICIES["ai-suggestions"].prefix,
    }),
    "support-chat": new Ratelimit({
      redis: upstashRedis,
      limiter: Ratelimit.slidingWindow(
        RATE_LIMIT_POLICIES["support-chat"].limit,
        `${RATE_LIMIT_POLICIES["support-chat"].windowSeconds} s`,
      ),
      prefix: RATE_LIMIT_POLICIES["support-chat"].prefix,
    }),
  };
  return cachedLimiterByPolicy;
}

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

function encodeUsagePart(value: string): string {
  return encodeURIComponent(value);
}

async function recordApiUsage(options: {
  route: string;
  identifier: string;
  rateLimitHit: boolean;
  requestId: string;
}): Promise<void> {
  const upstashRedis = getUpstashRedis();
  if (!upstashRedis) {
    return;
  }
  try {
    const encodedRoute = encodeUsagePart(options.route);
    const encodedUser = encodeUsagePart(options.identifier);
    const commands: Promise<unknown>[] = [
      upstashRedis.incr(`kepi:api-usage:endpoint:${encodedRoute}`),
      upstashRedis.incr(`kepi:api-usage:user:${encodedUser}`),
    ];
    if (options.rateLimitHit) {
      commands.push(upstashRedis.incr(`kepi:api-usage:rate-limit-hit:${encodedRoute}`));
    }
    await Promise.all(commands);
  } catch (error) {
    logger.withContext({
      requestId: options.requestId,
      route: options.route,
      identifier: options.identifier,
    }).warn("Failed to record API usage metrics in Upstash.", {
      error,
    });
  }
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

  const limiter = getUpstashLimiterByPolicy()[options.policyName];
  if (!limiter) {
    const fallbackResult = applyMemoryRateLimit(options.policyName, options.identifier);
    await recordApiUsage({
      route: options.route,
      identifier: options.identifier,
      rateLimitHit: !fallbackResult.allowed,
      requestId: options.requestId,
    });
    return fallbackResult;
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
    await recordApiUsage({
      route: options.route,
      identifier: options.identifier,
      rateLimitHit: !result.success,
      requestId: options.requestId,
    });
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
    const fallbackResult = applyMemoryRateLimit(options.policyName, options.identifier);
    await recordApiUsage({
      route: options.route,
      identifier: options.identifier,
      rateLimitHit: !fallbackResult.allowed,
      requestId: options.requestId,
    });
    return fallbackResult;
  }
}
