import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { NextResponse } from "next/server";

/** Block non-admin access to debug/diagnostic routes in production. */
export async function requireAdminApiAccess(_route: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isAdminUserId(userId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, userId };
}

/** In production, debug routes are admin-only; in dev/test any signed-in user may access. */
export async function requireDebugApiAccess(route: string): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  if (process.env.NODE_ENV === "production") {
    return requireAdminApiAccess(route);
  }
  const userId = await resolveAuthenticatedUserId();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId };
}
