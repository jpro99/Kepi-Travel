import { kv } from "@vercel/kv";

const KEPI_NAMESPACE_PREFIX = "kepi:";
const fallbackStore = new Map<string, unknown>();
let missingEnvWarningLogged = false;

function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toNamespacedKey(key: string): string {
  const normalized = key.startsWith(":") ? key.slice(1) : key;
  return normalized.startsWith(KEPI_NAMESPACE_PREFIX)
    ? normalized
    : `${KEPI_NAMESPACE_PREFIX}${normalized}`;
}

function warnMissingKvEnv(): void {
  if (missingEnvWarningLogged) return;
  missingEnvWarningLogged = true;
  console.warn(
    "[travelAssistant/kvStore] KV_REST_API_URL or KV_REST_API_TOKEN is not set. Falling back to in-memory local store.",
  );
}

export async function kvStoreGet<T>(key: string): Promise<T | null> {
  const namespacedKey = toNamespacedKey(key);
  if (!isKvConfigured()) {
    warnMissingKvEnv();
    if (!fallbackStore.has(namespacedKey)) return null;
    return cloneValue(fallbackStore.get(namespacedKey) as T);
  }
  return (await kv.get<T>(namespacedKey)) ?? null;
}

export async function kvStoreSet<T>(key: string, value: T): Promise<void> {
  const namespacedKey = toNamespacedKey(key);
  if (!isKvConfigured()) {
    warnMissingKvEnv();
    fallbackStore.set(namespacedKey, cloneValue(value));
    return;
  }
  await kv.set(namespacedKey, value);
}

export async function kvStoreSetNx<T>(key: string, value: T): Promise<boolean> {
  const namespacedKey = toNamespacedKey(key);
  if (!isKvConfigured()) {
    warnMissingKvEnv();
    if (fallbackStore.has(namespacedKey)) return false;
    fallbackStore.set(namespacedKey, cloneValue(value));
    return true;
  }
  const result = await kv.set(namespacedKey, value, { nx: true });
  return result === "OK";
}

export async function kvStoreDel(key: string): Promise<void> {
  const namespacedKey = toNamespacedKey(key);
  if (!isKvConfigured()) {
    warnMissingKvEnv();
    fallbackStore.delete(namespacedKey);
    return;
  }
  await kv.del(namespacedKey);
}

export async function kvStoreList<T>(
  keyPrefix: string,
  options?: { limit?: number },
): Promise<Array<{ key: string; value: T | null }>> {
  const namespacedPrefix = toNamespacedKey(keyPrefix);
  const matchPattern = `${namespacedPrefix}*`;
  const limit = Math.max(1, options?.limit ?? 100);

  if (!isKvConfigured()) {
    warnMissingKvEnv();
    const entries = Array.from(fallbackStore.entries())
      .filter(([key]) => key.startsWith(namespacedPrefix))
      .slice(0, limit)
      .map(([key, value]) => ({
        key,
        value: cloneValue(value as T),
      }));
    return entries;
  }

  const keys: string[] = [];
  for await (const key of kv.scanIterator({ match: matchPattern })) {
    keys.push(String(key));
    if (keys.length >= limit) break;
  }

  const values = await Promise.all(
    keys.map(async (key) => ({
      key,
      value: (await kv.get<T>(key)) ?? null,
    })),
  );
  return values;
}
