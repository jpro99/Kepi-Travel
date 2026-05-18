import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";

const ADMIN_ENV_SEPARATOR = ",";

export function parseAdminUserIds(rawValue = process.env.ADMIN_USER_IDS): string[] {
  if (!rawValue) {
    return [];
  }
  return rawValue
    .split(ADMIN_ENV_SEPARATOR)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) {
    return false;
  }
  const adminUserIds = new Set(parseAdminUserIds());
  if (adminUserIds.size === 0) {
    return false;
  }
  return adminUserIds.has(userId);
}

export async function resolveAuthenticatedUserId(): Promise<string | null> {
  const isTestEnv = isAutomatedTestRuntime();
  try {
    const clerkServer = await import("@clerk/nextjs/server");
    const session = await clerkServer.auth();
    if (session.userId) {
      return session.userId;
    }
    return isTestEnv ? "test-user" : null;
  } catch {
    return isTestEnv ? "test-user" : null;
  }
}
