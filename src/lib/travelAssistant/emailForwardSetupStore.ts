import { logger } from "@/lib/logger";
import { getSafeRedisClient } from "@/lib/redis";
import { kvStoreDel, kvStoreGet, kvStoreList, kvStoreSet, kvStoreSetNx } from "@/lib/travelAssistant/kvStore";

const EMAIL_HANDLE_SYSTEM_NAMESPACE = "__email-forward-system";
const USER_HANDLE_KEY_PREFIX = "email-handle:user";
const HANDLE_OWNER_KEY_PREFIX = "email-handle:handle";
const USER_HANDLE_META_KEY_PREFIX = "email-handle:meta:user";
const GMAIL_PROMPT_SEEN_KEY = "onboarding:gmail-prompt:seen";
const DEFAULT_FORWARD_DOMAIN = "trips.kepitravel.com";
const MAX_HANDLE_LENGTH = 20;
const CUSTOM_HANDLE_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const SYSTEM_NAMESPACE_PREFIX = `kepi:${EMAIL_HANDLE_SYSTEM_NAMESPACE}:`;
const EMAIL_FORWARD_LOG_SCOPE = "travelAssistant/emailForwardSetupStore";

interface EmailHandleMetaRecord {
  createdAt: string;
  updatedAt: string;
  lastCustomChangeAt: string | null;
}

export interface EmailForwardSetupStatus {
  handle: string;
  forwardAddress: string;
  gmailPromptSeen: boolean;
  gmailPromptSeenAt: string | null;
  canChangeHandle: boolean;
  nextHandleChangeAt: string | null;
}

function normalizedForwardDomain(): string {
  const domain = process.env.EMAIL_FORWARD_DOMAIN?.trim().toLowerCase() || DEFAULT_FORWARD_DOMAIN;
  return domain.replace(/^@/u, "");
}

function userHandleKey(userId: string): string {
  return `${USER_HANDLE_KEY_PREFIX}:${userId}`;
}

function handleOwnerKey(handle: string): string {
  return `${HANDLE_OWNER_KEY_PREFIX}:${handle}`;
}

function handleOwnerRedisKey(handle: string): string {
  return toSystemNamespaceKey(handleOwnerKey(handle));
}

function userHandleMetaKey(userId: string): string {
  return `${USER_HANDLE_META_KEY_PREFIX}:${userId}`;
}

function toSystemNamespaceKey(key: string): string {
  const normalized = key.startsWith(":") ? key.slice(1) : key;
  return normalized.startsWith(SYSTEM_NAMESPACE_PREFIX)
    ? normalized
    : `${SYSTEM_NAMESPACE_PREFIX}${normalized}`;
}

function getEmailForwardSystemRedis() {
  return getSafeRedisClient(EMAIL_FORWARD_LOG_SCOPE);
}

async function getHandleOwner(handle: string, context?: { caller?: string }): Promise<string | null> {
  const redisReadKey = handleOwnerRedisKey(handle);
  const redis = getEmailForwardSystemRedis();
  if (redis) {
    try {
      logger.info("Reading email handle owner from Redis.", {
        scope: EMAIL_FORWARD_LOG_SCOPE,
        caller: context?.caller ?? "getHandleOwner",
        handle,
        redisReadKey,
      });
      const owner = await redis.get<string>(redisReadKey);
      return typeof owner === "string" && owner.trim().length > 0 ? owner : null;
    } catch (error) {
      logger.warn("Failed to read email handle owner from Redis, falling back to kvStore.", {
        scope: EMAIL_FORWARD_LOG_SCOPE,
        caller: context?.caller ?? "getHandleOwner",
        handle,
        redisReadKey,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  const owner = await kvStoreGet<string>(handleOwnerKey(handle), { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE });
  return typeof owner === "string" && owner.trim().length > 0 ? owner : null;
}

async function setHandleOwner(handle: string, userId: string): Promise<void> {
  const redis = getEmailForwardSystemRedis();
  if (redis) {
    const namespacedKey = handleOwnerRedisKey(handle);
    await redis.set(namespacedKey, userId);
    const persistedOwner = await redis.get<string>(namespacedKey);
    if (persistedOwner !== userId) {
      throw new Error(`Unable to persist handle owner mapping for ${handle}.`);
    }
    return;
  }
  await kvStoreSet(handleOwnerKey(handle), userId, { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE });
}

async function setHandleOwnerIfAbsent(handle: string, userId: string): Promise<boolean> {
  const redis = getEmailForwardSystemRedis();
  if (redis) {
    const namespacedKey = handleOwnerRedisKey(handle);
    const claimResult = await redis.set(namespacedKey, userId, { nx: true });
    if (claimResult === "OK") {
      return true;
    }
    const existingOwner = await redis.get<string>(namespacedKey);
    return existingOwner === userId;
  }

  const ownerClaimed = await kvStoreSetNx(handleOwnerKey(handle), userId, {
    userId: EMAIL_HANDLE_SYSTEM_NAMESPACE,
  });
  if (ownerClaimed) {
    return true;
  }
  const existingOwner = await kvStoreGet<string>(handleOwnerKey(handle), {
    userId: EMAIL_HANDLE_SYSTEM_NAMESPACE,
  });
  return existingOwner === userId;
}

async function deleteHandleOwner(handle: string): Promise<void> {
  const redis = getEmailForwardSystemRedis();
  if (redis) {
    await redis.del(handleOwnerRedisKey(handle));
    return;
  }
  await kvStoreDel(handleOwnerKey(handle), { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE });
}

function parseUserIdFromUserHandleRecordKey(key: string): string | null {
  const prefix = `kepi:${EMAIL_HANDLE_SYSTEM_NAMESPACE}:${USER_HANDLE_KEY_PREFIX}:`;
  if (!key.startsWith(prefix)) {
    return null;
  }
  const userId = key.slice(prefix.length).trim();
  return userId.length > 0 ? userId : null;
}

function composeForwardAddress(handle: string): string {
  return `${handle}@${normalizedForwardDomain()}`;
}

function sanitizePromptSeenAt(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw;
  }
  if (raw === true) {
    return new Date(0).toISOString();
  }
  return null;
}

function sanitizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/gu, "").replace(/^-+|-+$/gu, "").slice(0, MAX_HANDLE_LENGTH);
}

function sanitizeAutoUsernamePart(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.+]/gu, "")
    .replace(/[^a-z0-9]/gu, "")
    .slice(0, MAX_HANDLE_LENGTH);
}

function sanitizeHandleMeta(raw: unknown): EmailHandleMetaRecord {
  if (!raw || typeof raw !== "object") {
    return {
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      lastCustomChangeAt: null,
    };
  }
  const candidate = raw as Partial<EmailHandleMetaRecord>;
  return {
    createdAt: typeof candidate.createdAt === "string" && candidate.createdAt.trim().length > 0
      ? candidate.createdAt
      : new Date(0).toISOString(),
    updatedAt: typeof candidate.updatedAt === "string" && candidate.updatedAt.trim().length > 0
      ? candidate.updatedAt
      : new Date(0).toISOString(),
    lastCustomChangeAt:
      typeof candidate.lastCustomChangeAt === "string" && candidate.lastCustomChangeAt.trim().length > 0
        ? candidate.lastCustomChangeAt
        : null,
  };
}

function withSuffix(base: string, suffixNumber: number): string {
  if (suffixNumber <= 1) {
    return base;
  }
  const suffix = `-${suffixNumber}`;
  const maxBaseLength = Math.max(1, MAX_HANDLE_LENGTH - suffix.length);
  const clippedBase = base.slice(0, maxBaseLength);
  return `${clippedBase}${suffix}`;
}

async function resolvePrimaryEmailLocalPart(userId: string): Promise<string | null> {
  try {
    const clerkServer = await import("@clerk/nextjs/server");
    const client = await clerkServer.clerkClient();
    const user = await client.users.getUser(userId);
    const primaryId = user.primaryEmailAddressId;
    const primary =
      user.emailAddresses.find((entry) => entry.id === primaryId) ?? user.emailAddresses[0] ?? null;
    const email = primary?.emailAddress?.trim().toLowerCase() ?? "";
    if (!email.includes("@")) {
      return null;
    }
    return email.split("@")[0] ?? null;
  } catch {
    return null;
  }
}

async function claimHandleForUser(userId: string, baseHandleInput: string): Promise<string> {
  const baseHandle = sanitizeHandle(baseHandleInput) || "traveler";
  for (let suffixNumber = 1; suffixNumber <= 2000; suffixNumber += 1) {
    const candidate = withSuffix(baseHandle, suffixNumber);
    const ownerClaimed = await setHandleOwnerIfAbsent(candidate, userId);
    if (ownerClaimed) {
      return candidate;
    }
    const existingOwner = await getHandleOwner(candidate);
    if (existingOwner === userId) {
      return candidate;
    }
  }
  throw new Error("Unable to allocate unique email forwarding handle.");
}

async function ensureUserHandleMeta(userId: string, patch?: Partial<EmailHandleMetaRecord>): Promise<EmailHandleMetaRecord> {
  const existing = sanitizeHandleMeta(
    await kvStoreGet<unknown>(userHandleMetaKey(userId), { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE }),
  );
  const nowIso = new Date().toISOString();
  const next: EmailHandleMetaRecord = {
    createdAt: existing.createdAt === new Date(0).toISOString() ? nowIso : existing.createdAt,
    updatedAt: nowIso,
    lastCustomChangeAt: existing.lastCustomChangeAt,
    ...patch,
  };
  await kvStoreSet(userHandleMetaKey(userId), next, { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE });
  return next;
}

async function ensureForwardHandle(userId: string): Promise<string> {
  logger.info("ensureForwardHandle called", {
    scope: EMAIL_FORWARD_LOG_SCOPE,
    userId,
  });
  const existing = await kvStoreGet<string>(userHandleKey(userId), { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE });
  if (typeof existing === "string" && existing.trim().length > 0) {
    const sanitized = sanitizeHandle(existing);
    if (sanitized.length > 0) {
      const owner = await getHandleOwner(sanitized);
      if (!owner || owner === userId) {
        const ownerMappingKey = handleOwnerRedisKey(sanitized);
        logger.info("ensureForwardHandle writing owner mapping", {
          scope: EMAIL_FORWARD_LOG_SCOPE,
          userId,
          handle: sanitized,
          ownerMappingKey,
        });
        try {
          await setHandleOwner(sanitized, userId);
          logger.info("ensureForwardHandle owner mapping write result", {
            scope: EMAIL_FORWARD_LOG_SCOPE,
            userId,
            handle: sanitized,
            ownerMappingKey,
            writeSucceeded: true,
          });
        } catch (error) {
          logger.error("ensureForwardHandle owner mapping write result", {
            scope: EMAIL_FORWARD_LOG_SCOPE,
            userId,
            handle: sanitized,
            ownerMappingKey,
            writeSucceeded: false,
            error: error instanceof Error ? error.message : "unknown",
          });
          throw error;
        }
        await kvStoreSet(userHandleKey(userId), sanitized, { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE });
        await ensureUserHandleMeta(userId);
        logger.info("ensureForwardHandle resolved handle", {
          scope: EMAIL_FORWARD_LOG_SCOPE,
          userId,
          handle: sanitized,
          source: "existing-user-handle",
        });
        return sanitized;
      }
    }
  }

  const localPart = await resolvePrimaryEmailLocalPart(userId);
  const baseHandle = sanitizeAutoUsernamePart(localPart ?? "") || "traveler";
  const claimed = await claimHandleForUser(userId, baseHandle);
  const ownerMappingKey = handleOwnerRedisKey(claimed);
  logger.info("ensureForwardHandle writing owner mapping", {
    scope: EMAIL_FORWARD_LOG_SCOPE,
    userId,
    handle: claimed,
    ownerMappingKey,
  });
  try {
    await setHandleOwner(claimed, userId);
    logger.info("ensureForwardHandle owner mapping write result", {
      scope: EMAIL_FORWARD_LOG_SCOPE,
      userId,
      handle: claimed,
      ownerMappingKey,
      writeSucceeded: true,
    });
  } catch (error) {
    logger.error("ensureForwardHandle owner mapping write result", {
      scope: EMAIL_FORWARD_LOG_SCOPE,
      userId,
      handle: claimed,
      ownerMappingKey,
      writeSucceeded: false,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
  await kvStoreSet(userHandleKey(userId), claimed, { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE });
  await ensureUserHandleMeta(userId, { lastCustomChangeAt: null });
  logger.info("ensureForwardHandle resolved handle", {
    scope: EMAIL_FORWARD_LOG_SCOPE,
    userId,
    handle: claimed,
    source: "newly-claimed-handle",
  });
  return claimed;
}

function computeHandleChangeWindow(meta: EmailHandleMetaRecord): { canChangeHandle: boolean; nextHandleChangeAt: string | null } {
  if (!meta.lastCustomChangeAt) {
    return { canChangeHandle: true, nextHandleChangeAt: null };
  }
  const lastChangeMs = Date.parse(meta.lastCustomChangeAt);
  if (Number.isNaN(lastChangeMs)) {
    return { canChangeHandle: true, nextHandleChangeAt: null };
  }
  const nextChangeMs = lastChangeMs + CUSTOM_HANDLE_CHANGE_COOLDOWN_MS;
  if (Date.now() >= nextChangeMs) {
    return { canChangeHandle: true, nextHandleChangeAt: null };
  }
  return { canChangeHandle: false, nextHandleChangeAt: new Date(nextChangeMs).toISOString() };
}

export async function getEmailForwardSetupStatus(userId: string): Promise<EmailForwardSetupStatus> {
  const [handle, promptSeenRaw, metaRaw] = await Promise.all([
    ensureForwardHandle(userId),
    kvStoreGet<string | boolean | null>(GMAIL_PROMPT_SEEN_KEY, { userId }),
    kvStoreGet<unknown>(userHandleMetaKey(userId), { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE }),
  ]);
  const promptSeenAt = sanitizePromptSeenAt(promptSeenRaw);
  const meta = sanitizeHandleMeta(metaRaw);
  const changeWindow = computeHandleChangeWindow(meta);
  return {
    handle,
    forwardAddress: composeForwardAddress(handle),
    gmailPromptSeen: promptSeenAt !== null,
    gmailPromptSeenAt: promptSeenAt,
    canChangeHandle: changeWindow.canChangeHandle,
    nextHandleChangeAt: changeWindow.nextHandleChangeAt,
  };
}

export async function changeForwardHandle(userId: string, requestedHandleRaw: string): Promise<EmailForwardSetupStatus> {
  const requestedHandle = sanitizeHandle(requestedHandleRaw);
  if (!requestedHandle || requestedHandle.length < 3) {
    throw new Error("Handle must be at least 3 characters and use only letters, numbers, or dashes.");
  }
  const currentHandle = await ensureForwardHandle(userId);
  const meta = sanitizeHandleMeta(
    await kvStoreGet<unknown>(userHandleMetaKey(userId), { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE }),
  );
  const changeWindow = computeHandleChangeWindow(meta);
  if (!changeWindow.canChangeHandle && requestedHandle !== currentHandle) {
    const next = changeWindow.nextHandleChangeAt ? new Date(changeWindow.nextHandleChangeAt).toLocaleDateString() : "later";
    throw new Error(`Handle can only be changed once every 30 days. Next change allowed on ${next}.`);
  }

  if (requestedHandle !== currentHandle) {
    const existingOwner = await getHandleOwner(requestedHandle);
    if (existingOwner && existingOwner !== userId) {
      throw new Error("That forwarding handle is already taken.");
    }
    if (!existingOwner) {
      const claimed = await setHandleOwnerIfAbsent(requestedHandle, userId);
      if (!claimed) {
        throw new Error("That forwarding handle is already taken.");
      }
    }
    await setHandleOwner(requestedHandle, userId);
    await kvStoreSet(userHandleKey(userId), requestedHandle, { userId: EMAIL_HANDLE_SYSTEM_NAMESPACE });
    const currentOwner = await getHandleOwner(currentHandle);
    if (currentOwner === userId) {
      await deleteHandleOwner(currentHandle);
    }
    await ensureUserHandleMeta(userId, { lastCustomChangeAt: new Date().toISOString() });
  } else {
    await ensureUserHandleMeta(userId);
  }

  return getEmailForwardSetupStatus(userId);
}

function extractEmailAddress(value: string): string {
  const bracketMatch = value.match(/<([^>]+)>/u);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].trim().toLowerCase();
  }
  return value.trim().toLowerCase();
}

export function extractHandleFromForwardAddress(addressLike: string): string | null {
  const normalizedAddress = extractEmailAddress(addressLike);
  if (!normalizedAddress.includes("@")) {
    return null;
  }
  const [localPart, domain] = normalizedAddress.split("@");
  if (!localPart || !domain || domain !== normalizedForwardDomain()) {
    return null;
  }
  const handle = sanitizeHandle(localPart);
  return handle.length > 0 ? handle : null;
}

async function repairHandleOwnerMapping(handle: string): Promise<string | null> {
  const records = await kvStoreList<string>(`${USER_HANDLE_KEY_PREFIX}:`, {
    userId: EMAIL_HANDLE_SYSTEM_NAMESPACE,
    limit: 5000,
  });
  for (const record of records) {
    if (sanitizeHandle(record.value ?? "") !== handle) {
      continue;
    }
    const userId = parseUserIdFromUserHandleRecordKey(record.key);
    if (!userId) {
      continue;
    }
    await setHandleOwner(handle, userId);
    return userId;
  }
  return null;
}

export async function resolveUserIdByForwardAddress(addressLike: string): Promise<string | null> {
  const handle = extractHandleFromForwardAddress(addressLike);
  if (!handle) {
    logger.info("resolveUserIdByForwardAddress handle parse failed", {
      scope: EMAIL_FORWARD_LOG_SCOPE,
      addressLike,
    });
    return null;
  }
  const ownerLookupKey = handleOwnerRedisKey(handle);
  logger.info("resolveUserIdByForwardAddress owner lookup", {
    scope: EMAIL_FORWARD_LOG_SCOPE,
    addressLike,
    handle,
    ownerLookupKey,
    expectedEnsureForwardHandleWriteKey: ownerLookupKey,
    readWriteKeyDerivation: "handleOwnerRedisKey",
  });
  const userId = await getHandleOwner(handle, { caller: "resolveUserIdByForwardAddress" });
  logger.info("resolveUserIdByForwardAddress owner lookup result", {
    scope: EMAIL_FORWARD_LOG_SCOPE,
    handle,
    ownerLookupKey,
    foundUserId: userId,
  });
  if (userId) {
    return userId;
  }
  const repairedUserId = await repairHandleOwnerMapping(handle);
  logger.info("resolveUserIdByForwardAddress repair result", {
    scope: EMAIL_FORWARD_LOG_SCOPE,
    handle,
    ownerLookupKey,
    repairedUserId,
  });
  return repairedUserId;
}

export async function markGmailPromptSeen(userId: string): Promise<void> {
  await kvStoreSet(GMAIL_PROMPT_SEEN_KEY, new Date().toISOString(), { userId });
}
