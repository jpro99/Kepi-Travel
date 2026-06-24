import { auth } from "@clerk/nextjs/server";
import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";

let cachedAdminIds: Set<string> | null = null;

function getAdminUserIds(): Set<string> {
  if (cachedAdminIds) return cachedAdminIds;
  const ids = new Set<string>();
  const raw = process.env.ADMIN_USER_IDS?.trim();
  if (raw) {
    for (const part of raw.split(/[,;\s]+/)) {
      const id = part.trim();
      if (id) ids.add(id);
    }
  }
  // Legacy dev / automated test fallbacks
  ids.add("1");
  if (isAutomatedTestRuntime()) {
    ids.add("test-user");
  }
  cachedAdminIds = ids;
  return ids;
}

/** Reset cached admin IDs — for tests only. */
export function resetAdminUserIdsCacheForTests(): void {
  cachedAdminIds = null;
}

export async function resolveAuthenticatedUserId(): Promise<string | null> {
  const isTestEnv = isAutomatedTestRuntime();
  try {
    const { userId } = await auth();
    if (userId) {
      return userId;
    }
    return isTestEnv ? "test-user" : null;
  } catch {
    return isTestEnv ? "test-user" : null;
  }
}

/** Synchronous admin check — safe to use in route handlers and RSC. */
export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getAdminUserIds().has(userId);
}

export async function requireAdminUserId(): Promise<string | null> {
  const userId = await resolveAuthenticatedUserId();
  if (!userId || !isAdminUserId(userId)) return null;
  return userId;
}
