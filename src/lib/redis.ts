import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

const REDIS_URL_ENV_KEYS = ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"] as const;
const REDIS_TOKEN_ENV_KEYS = ["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"] as const;

let cachedRedisClient: Redis | null | undefined;
let cachedRawRedisClient: Redis | null | undefined;

function hasAnyEnvValue(keys: readonly string[]): boolean {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

export function hasRedisEnvConfig(): boolean {
  return hasAnyEnvValue(REDIS_URL_ENV_KEYS) && hasAnyEnvValue(REDIS_TOKEN_ENV_KEYS);
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

export function getSafeRawRedisClient(scope = "redis"): Redis | null {
  if (cachedRawRedisClient !== undefined) {
    return cachedRawRedisClient;
  }

  if (!hasRedisEnvConfig()) {
    cachedRawRedisClient = null;
    return cachedRawRedisClient;
  }

  try {
    cachedRawRedisClient = Redis.fromEnv({ automaticDeserialization: false });
    return cachedRawRedisClient;
  } catch (error) {
    logger.warn("Unable to initialize raw Upstash Redis from environment.", {
      scope,
      error: error instanceof Error ? error.message : "unknown",
    });
    cachedRawRedisClient = null;
    return cachedRawRedisClient;
  }
}

