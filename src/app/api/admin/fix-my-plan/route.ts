import { NextResponse } from "next/server";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { invalidateCachedBillingStatus } from "@/lib/billing/billingStatusCache";
import {
  getBillingPlanMirrorKey,
  getSubscriptionStorageKey,
  getUserLifetimeMirrorKey,
} from "@/lib/billing/subscriptionStore";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getSafeRedisClient } from "@/lib/redis";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_USER_ID = "user_3Ds1bOEqp8x6uOrk7omvcM7gxEm";

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/admin/fix-my-plan",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized fix-my-plan request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUserId(userId)) {
    routeLogger.warn("Forbidden fix-my-plan request from non-admin user.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/admin/fix-my-plan",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many fix-my-plan requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  const subscriptionStorageKey = getSubscriptionStorageKey(TARGET_USER_ID);
  const billingPlanMirrorKey = getBillingPlanMirrorKey(TARGET_USER_ID);
  const userLifetimeMirrorKey = getUserLifetimeMirrorKey(TARGET_USER_ID);
  const payload = {
    plan: "lifetime",
    lifetimePlan: true,
    redeemedAt: new Date().toISOString(),
  } as const;
  const redis = getSafeRedisClient("api/admin/fix-my-plan");
  if (!redis) {
    return NextResponse.json(
      {
        ok: false,
        error: "Redis is not configured. Please verify UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      },
      { status: 503, headers: rateLimit.headers },
    );
  }

  try {
    await Promise.all([
      redis.set(subscriptionStorageKey, payload),
      redis.set(billingPlanMirrorKey, "lifetime"),
      redis.set(userLifetimeMirrorKey, true),
    ]);
  } catch (error) {
    routeLogger.error("Admin fix-my-plan failed to write KV records.", {
      error: error instanceof Error ? error.message : "unknown",
      subscriptionStorageKey,
      billingPlanMirrorKey,
      userLifetimeMirrorKey,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "KV write failed. Please verify Redis credentials and retry.",
      },
      { status: 503, headers: rateLimit.headers },
    );
  }
  invalidateCachedBillingStatus(TARGET_USER_ID);

  routeLogger.info("Admin fix-my-plan applied.", {
    targetUserId: TARGET_USER_ID,
    subscriptionStorageKey,
    billingPlanMirrorKey,
    userLifetimeMirrorKey,
    payload,
  });

  return NextResponse.json(
    {
      ok: true,
      targetUserId: TARGET_USER_ID,
      subscriptionStorageKey,
      payload,
    },
    { headers: rateLimit.headers },
  );
}
