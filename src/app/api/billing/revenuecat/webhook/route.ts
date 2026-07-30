import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRevenueCatEntitlements } from "@/lib/billing/applyRevenueCatEntitlements";
import {
  EXPIRING_REVENUECAT_EVENT_TYPES,
  GRANTING_REVENUECAT_EVENT_TYPES,
} from "@/lib/billing/revenueCatCatalog";
import { trackServerEvent } from "@/lib/analytics/trackServerEvent";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EventSchema = z.object({
  type: z.string(),
  id: z.string().optional(),
  app_user_id: z.string().optional(),
  original_app_user_id: z.string().optional(),
  entitlement_ids: z.array(z.string()).nullable().optional(),
  entitlement_id: z.string().nullable().optional(),
  expiration_at_ms: z.number().nullable().optional(),
  environment: z.string().optional(),
  product_id: z.string().optional(),
});

const BodySchema = z.object({
  api_version: z.string().optional(),
  event: EventSchema,
});

function authorizeWebhook(req: Request): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION?.trim();
  if (!expected) {
    // Misconfigured — reject rather than accept anonymous plan grants.
    return false;
  }
  const auth = req.headers.get("authorization")?.trim() ?? "";
  return auth === expected || auth === `Bearer ${expected}`;
}

/**
 * RevenueCat → Kepi plan sync (Apple IAP).
 * Configure webhook URL: https://kepitravel.com/api/billing/revenuecat/webhook
 * Set Authorization header in RC dashboard to match REVENUECAT_WEBHOOK_AUTHORIZATION.
 */
export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const routeLogger = logger.withContext({
    requestId,
    route: "/api/billing/revenuecat/webhook",
  });

  if (!authorizeWebhook(req)) {
    routeLogger.warn("RevenueCat webhook unauthorized.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    routeLogger.warn("RevenueCat webhook validation failed.", {
      issues: parsed.error.issues.length,
    });
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const event = parsed.data.event;
  if (event.type === "TEST") {
    routeLogger.info("RevenueCat TEST webhook received.");
    return NextResponse.json({ ok: true, test: true });
  }

  const appUserId = (event.app_user_id ?? event.original_app_user_id ?? "").trim();
  if (!appUserId) {
    routeLogger.warn("RevenueCat webhook missing app_user_id.");
    return NextResponse.json({ ok: true, skipped: "no_user" });
  }

  const entitlementIds = [
    ...(event.entitlement_ids ?? []),
    ...(event.entitlement_id ? [event.entitlement_id] : []),
  ].filter(Boolean);

  try {
    if (EXPIRING_REVENUECAT_EVENT_TYPES.has(event.type)) {
      await applyRevenueCatEntitlements({
        appUserId,
        entitlementIds: [],
        expirationAtMs: event.expiration_at_ms,
        eventType: event.type,
        revokeIfEmpty: true,
      });
      return NextResponse.json({ ok: true, applied: "expired" });
    }

    if (GRANTING_REVENUECAT_EVENT_TYPES.has(event.type) || entitlementIds.length > 0) {
      const record = await applyRevenueCatEntitlements({
        appUserId,
        entitlementIds,
        expirationAtMs: event.expiration_at_ms,
        eventType: event.type,
      });
      if (record.plan === "pro" || record.plan === "concierge") {
        void trackServerEvent({
          type: "upgrade_completed",
          userId: appUserId,
          newPlan: record.plan,
        });
      }
      return NextResponse.json({ ok: true, plan: record.plan });
    }

    // CANCELLATION / BILLING_ISSUE — access continues until EXPIRATION
    routeLogger.info("RevenueCat webhook acknowledged without plan change.", {
      type: event.type,
      appUserId,
    });
    return NextResponse.json({ ok: true, skipped: event.type });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook apply failed";
    routeLogger.warn("RevenueCat webhook apply failed.", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
