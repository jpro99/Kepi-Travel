import { NextResponse } from "next/server";
import { requireDebugApiAccess } from "@/lib/admin/requireAdminApiAccess";
import {
  getRawSubscriptionRecordForDebug,
  getSubscriptionRecord,
  getSubscriptionStorageKey,
} from "@/lib/billing/subscriptionStore";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const access = await requireDebugApiAccess("/api/debug/billing");
  if (!access.ok) return access.response;
  const userId = access.userId;
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/debug/billing",
  });

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/debug/billing",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many debug requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  const subscriptionStorageKey = getSubscriptionStorageKey(userId);
  const [rawSubscriptionRecord, normalizedSubscriptionRecord] = await Promise.all([
    getRawSubscriptionRecordForDebug(userId),
    getSubscriptionRecord(userId),
  ]);

  routeLogger.info("Debug billing subscription lookup.", {
    userId,
    subscriptionStorageKey,
    rawSubscriptionRecord,
  });

  return NextResponse.json(
    {
      ok: true,
      userId,
      subscriptionStorageKey,
      rawSubscriptionRecord,
      normalizedSubscriptionRecord,
    },
    { headers: rateLimit.headers },
  );
}
