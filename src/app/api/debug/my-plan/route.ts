import { NextResponse } from "next/server";
import { requireDebugApiAccess } from "@/lib/admin/requireAdminApiAccess";
import { getRawSubscriptionRecordForDebug, getSubscriptionRecord, getSubscriptionStorageKey, isSubscriptionActive } from "@/lib/billing/subscriptionStore";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolvePlan(record: Awaited<ReturnType<typeof getSubscriptionRecord>>): "free" | "pro" | "concierge" | "lifetime" | "trial" {
  if (record.lifetimePlan) {
    return "lifetime";
  }
  if (record.trialExpiresAt && Date.parse(record.trialExpiresAt) > Date.now()) {
    return "trial";
  }
  if (isSubscriptionActive(record)) {
    return record.plan === "concierge" ? "concierge" : "pro";
  }
  return "free";
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const access = await requireDebugApiAccess("/api/debug/my-plan");
  if (!access.ok) return access.response;
  const userId = access.userId;
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/debug/my-plan",
  });

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/debug/my-plan",
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
  const resolvedPlan = resolvePlan(normalizedSubscriptionRecord);

  routeLogger.info("Debug my-plan lookup complete.", {
    userId,
    subscriptionStorageKey,
    rawSubscriptionRecord,
    resolvedPlan,
  });

  return NextResponse.json(
    {
      ok: true,
      userId,
      subscriptionStorageKey,
      rawSubscriptionRecord,
      resolvedPlan,
    },
    { headers: rateLimit.headers },
  );
}
