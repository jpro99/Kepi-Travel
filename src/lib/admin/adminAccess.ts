import { isAutomatedTestRuntime } from "@/lib/auth/mockClerkAuth";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function resolveAuthenticatedUserId(): Promise<string | null> {
  const isTestEnv = isAutomatedTestRuntime();
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      return session.user.id;
    }
    return isTestEnv ? "test-user" : null;
  } catch {
    return isTestEnv ? "test-user" : null;
  }
}

export async function isAdminUserId(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  // In a real application, this would be a database lookup.
  // For now, we'll hardcode the admin user ID.
  return userId === "1";
}