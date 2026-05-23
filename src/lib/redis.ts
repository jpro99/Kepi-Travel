import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

const REQUIRED_REDIS_ENV_KEYS = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"] as const;

let cachedRedisClient: Redis | null | undefined;

export function hasRedisEnvConfig(): boolean {
  return REQUIRED_REDIS_ENV_KEYS.every((key) => process.env[key]?.trim());
}

export function getSafeRedisClient(scope = "redis"): Redis | null {
  if (cachedRedisClient !== undefined) {
    return cachedRedisClient;
  }

  if (!hasRedisEnvConfig()) {
    cachedRedisClient = null;
    return cachedRedisClient;
  }

  try {
    cachedRedisClient = Redis.fromEnv();
    return cachedRedisClient;
  } catch (error) {
    logger.warn("Unable to initialize Upstash Redis from environment.", {
      scope,
      error: error instanceof Error ? error.message : "unknown",
    });
    cachedRedisClient = null;
    return cachedRedisClient;
  }
}

