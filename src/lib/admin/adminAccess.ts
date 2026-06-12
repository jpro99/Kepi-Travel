import { auth } from "@clerk/nextjs/server";
import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";

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

export async function isAdminUserId(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  return userId === "1";
}
