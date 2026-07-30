import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRevenueCatEntitlements } from "@/lib/billing/applyRevenueCatEntitlements";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  entitlementIds: z.array(z.string()).default([]),
  expirationAtMs: z.number().nullable().optional(),
});

/**
 * After a native IAP purchase/restore, sync active entitlements into Kepi billing.
 * Prefer RevenueCat webhooks for renewals; this covers immediate post-purchase UX.
 */
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/billing/revenuecat/sync",
  });

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/billing/revenuecat/sync",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  try {
    const record = await applyRevenueCatEntitlements({
      appUserId: userId,
      entitlementIds: parsed.data.entitlementIds,
      expirationAtMs: parsed.data.expirationAtMs,
      eventType: "CLIENT_SYNC",
      revokeIfEmpty: parsed.data.entitlementIds.length === 0,
    });
    routeLogger.info("RevenueCat client sync applied.", { plan: record.plan });
    return NextResponse.json(
      { ok: true, plan: record.plan, validUntil: record.validUntil },
      { headers: rateLimit.headers },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    routeLogger.warn("RevenueCat client sync failed.", { error: message });
    return NextResponse.json({ error: message }, { status: 500, headers: rateLimit.headers });
  }
}
