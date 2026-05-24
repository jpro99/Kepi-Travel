import { getSafeRedisClient, hasRedisEnvConfig } from "@/lib/redis";
import { getKvUserContextUserId } from "@/lib/travelAssistant/kvUserContext";
import { logger } from "@/lib/logger";

const KEPI_NAMESPACE_PREFIX = "kepi";
const ANONYMOUS_NAMESPACE = "anonymous";
const fallbackStore = new Map<string, unknown>();
let missingEnvWarningLogged = false;
let startupValidationLogged = false;

const REDIS_URL_ENV_KEYS = ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"] as const;
const REDIS_TOKEN_ENV_KEYS = ["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"] as const;

function getUpstashRedis() {
  return getSafeRedisClient("travelAssistant/kvStore");
}

function hasAnyRedisConfig(): boolean {
  return hasRedisEnvConfig();
}

function missingKvEnvKeys(): string[] {
  const missing: string[] = [];
  if (!REDIS_URL_ENV_KEYS.some((key) => Boolean(process.env[key]?.trim()))) {
    missing.push("UPSTASH_REDIS_REST_URL or KV_REST_API_URL");
  }
  if (!REDIS_TOKEN_ENV_KEYS.some((key) => Boolean(process.env[key]?.trim()))) {
    missing.push("UPSTASH_REDIS_REST_TOKEN or KV_REST_API_TOKEN");
  }
  return missing;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function resolveUserNamespace(userId?: string): Promise<string> {
  if (typeof userId === "string" && userId.trim().length > 0) {
    return userId.trim();
  }
  const contextUserId = getKvUserContextUserId();
  if (contextUserId && contextUserId.trim().length > 0) {
    return contextUserId.trim();
  }
  try {
    const clerkServerModule = await import("@clerk/nextjs/server");
    const session = await clerkServerModule.auth();
    if (typeof session.userId === "string" && session.userId.trim().length > 0) {
      return session.userId.trim();
    }
  } catch {
    // Ignore request-context errors in local scripts/tests and use shared fallback namespace.
  }
  return ANONYMOUS_NAMESPACE;
}

function toNamespacedKey(key: string, userNamespace: string): string {
  const normalized = key.startsWith(":") ? key.slice(1) : key;
  const scopedPrefix = `${KEPI_NAMESPACE_PREFIX}:${userNamespace}:`;
  return normalized.startsWith(scopedPrefix)
    ? normalized
    : `${scopedPrefix}${normalized}`;
}

function warnMissingKvEnv(trigger: "startup" | "runtime"): void {
  if (missingEnvWarningLogged) return;
  missingEnvWarningLogged = true;
  logger.warn(
    "Redis credentials are missing. Continuing with local in-memory fallback store (non-persistent).",
    {
      scope: "travelAssistant/kvStore",
      trigger,
      missingEnvKeys: missingKvEnvKeys(),
    },
  );
}

function validateKvConfigurationAtStartup(): void {
  if (startupValidationLogged) return;
  startupValidationLogged = true;
  if (hasAnyRedisConfig()) return;
  warnMissingKvEnv("startup");
}

export function getKvIntegrationHealth(): {
  configured: boolean;
  mode: "upstash-redis" | "memory-fallback";
  missingEnvKeys: string[];
} {
  const configured = Boolean(getUpstashRedis());
  const mode: "upstash-redis" | "memory-fallback" = configured ? "upstash-redis" : "memory-fallback";
  return {
    configured,
    mode,
    missingEnvKeys: configured ? [] : missingKvEnvKeys(),
  };
}

export async function kvStoreGet<T>(
  key: string,
  options?: { userId?: string },
): Promise<T | null> {
  const upstashRedis = getUpstashRedis();
  const userNamespace = await resolveUserNamespace(options?.userId);
  const namespacedKey = toNamespacedKey(key, userNamespace);
  if (!hasAnyRedisConfig() || !upstashRedis) {
    warnMissingKvEnv("runtime");
    if (!fallbackStore.has(namespacedKey)) return null;
    return cloneValue(fallbackStore.get(namespacedKey) as T);
  }
  try {
    return (await upstashRedis.get<T>(namespacedKey)) ?? null;
  } catch (error) {
    logger.warn("KV get failed. Falling back to in-memory snapshot when available.", {
      scope: "travelAssistant/kvStore",
      key: namespacedKey,
      error: error instanceof Error ? error.message : "unknown",
    });
    if (!fallbackStore.has(namespacedKey)) {
      return null;
    }
    return cloneValue(fallbackStore.get(namespacedKey) as T);
  }
}

export async function kvStoreSet<T>(
  key: string,
  value: T,
  options?: { userId?: string },
): Promise<void> {
  const upstashRedis = getUpstashRedis();
  const userNamespace = await resolveUserNamespace(options?.userId);
  const namespacedKey = toNamespacedKey(key, userNamespace);
  if (!hasAnyRedisConfig() || !upstashRedis) {
    warnMissingKvEnv("runtime");
    fallbackStore.set(namespacedKey, cloneValue(value));
    return;
  }
  try {
    await upstashRedis.set(namespacedKey, value);
  } catch (error) {
    logger.warn("KV set failed. Persisting in-memory fallback value.", {
      scope: "travelAssistant/kvStore",
      key: namespacedKey,
      error: error instanceof Error ? error.message : "unknown",
    });
    fallbackStore.set(namespacedKey, cloneValue(value));
  }
}

export async function kvStoreSetNx<T>(
  key: string,
  value: T,
  options?: { userId?: string },
): Promise<boolean> {
  const upstashRedis = getUpstashRedis();
  const userNamespace = await resolveUserNamespace(options?.userId);
  const namespacedKey = toNamespacedKey(key, userNamespace);
  if (!hasAnyRedisConfig() || !upstashRedis) {
    warnMissingKvEnv("runtime");
    if (fallbackStore.has(namespacedKey)) return false;
    fallbackStore.set(namespacedKey, cloneValue(value));
    return true;
  }
  try {
    const result = await upstashRedis.set(namespacedKey, value, { nx: true });
    return result === "OK";
  } catch (error) {
    logger.warn("KV setNX failed. Falling back to in-memory setNX.", {
      scope: "travelAssistant/kvStore",
      key: namespacedKey,
      error: error instanceof Error ? error.message : "unknown",
    });
    if (fallbackStore.has(namespacedKey)) return false;
    fallbackStore.set(namespacedKey, cloneValue(value));
    return true;
  }
}

export async function kvStoreDel(key: string, options?: { userId?: string }): Promise<void> {
  const upstashRedis = getUpstashRedis();
  const userNamespace = await resolveUserNamespace(options?.userId);
  const namespacedKey = toNamespacedKey(key, userNamespace);
  if (!hasAnyRedisConfig() || !upstashRedis) {
    warnMissingKvEnv("runtime");
    fallbackStore.delete(namespacedKey);
    return;
  }
  try {
    await upstashRedis.del(namespacedKey);
  } catch (error) {
    logger.warn("KV delete failed. Removing in-memory fallback value.", {
      scope: "travelAssistant/kvStore",
      key: namespacedKey,
      error: error instanceof Error ? error.message : "unknown",
    });
    fallbackStore.delete(namespacedKey);
  }
}

export async function kvStoreList<T>(
  keyPrefix: string,
  options?: { limit?: number; userId?: string },
): Promise<Array<{ key: string; value: T | null }>> {
  const upstashRedis = getUpstashRedis();
  const userNamespace = await resolveUserNamespace(options?.userId);
  const namespacedPrefix = toNamespacedKey(keyPrefix, userNamespace);
  const matchPattern = `${namespacedPrefix}*`;
  const limit = Math.max(1, options?.limit ?? 100);

  if (!hasAnyRedisConfig() || !upstashRedis) {
    warnMissingKvEnv("runtime");
    const entries = Array.from(fallbackStore.entries())
      .filter(([key]) => key.startsWith(namespacedPrefix))
      .slice(0, limit)
      .map(([key, value]) => ({
        key,
        value: cloneValue(value as T),
      }));
    return entries;
  }
  try {
    const keys = (await upstashRedis.keys(matchPattern)).slice(0, limit);
    const values = await Promise.all(
      keys.map(async (key) => ({
        key,
        value: (await upstashRedis.get<T>(key)) ?? null,
      })),
    );
    return values;
  } catch (error) {
    logger.warn("KV list failed. Falling back to in-memory key scan.", {
      scope: "travelAssistant/kvStore",
      keyPrefix: namespacedPrefix,
      error: error instanceof Error ? error.message : "unknown",
    });
    return Array.from(fallbackStore.entries())
      .filter(([key]) => key.startsWith(namespacedPrefix))
      .slice(0, limit)
      .map(([key, value]) => ({
        key,
        value: cloneValue(value as T),
      }));
  }
}

validateKvConfigurationAtStartup();
