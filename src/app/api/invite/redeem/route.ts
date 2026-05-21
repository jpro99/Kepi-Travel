import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { trackServerEvent } from "@/lib/analytics/trackServerEvent";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { getSubscriptionRecord, setSubscriptionRecord } from "@/lib/billing/subscriptionStore";
import { redeemInviteCode } from "@/lib/invite/inviteCodeStore";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const BodySchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{1,50}$/u),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/invite/redeem",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized invite redemption request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/invite/redeem",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many invite redemption attempts. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  const normalizedCode = parsed.data.code.toUpperCase().trim();
  const redemption = await redeemInviteCode(normalizedCode, userId);
  if (!redemption.ok) {
    const statusCode =
      redemption.reason === "already-redeemed"
        ? 409
        : redemption.reason === "code-revoked"
          ? 410
          : redemption.reason === "code-used"
            ? 409
            : 404;
    return NextResponse.json(
      {
        error:
          redemption.reason === "already-redeemed"
            ? "An invite code has already been redeemed for this account."
            : redemption.reason === "code-revoked"
              ? "This invite code has been revoked."
              : redemption.reason === "code-used"
                ? "This invite code has already been used."
                : "Invite code is invalid.",
        reason: redemption.reason,
      },
      { status: statusCode, headers: rateLimit.headers },
    );
  }

  const existingSubscription = await getSubscriptionRecord(userId);
  const nowMs = Date.now();
  let responseTrialExpiresAt: string | null = null;
  if (redemption.record.type === "lifetime") {
    await setSubscriptionRecord(userId, {
      plan: "pro",
      stripeCustomerId: existingSubscription.stripeCustomerId,
      stripeSubscriptionId: null,
      validUntil: null,
      lifetimePlan: true,
      trialExpiresAt: null,
    });
  } else {
    const trialExpiresAt = new Date(nowMs + 30 * DAY_IN_MS).toISOString();
    responseTrialExpiresAt = trialExpiresAt;
    await setSubscriptionRecord(userId, {
      plan: "pro",
      stripeCustomerId: existingSubscription.stripeCustomerId,
      stripeSubscriptionId: null,
      validUntil: trialExpiresAt,
      lifetimePlan: false,
      trialExpiresAt,
    });
  }

  void trackServerEvent({
    type: "invite_code_redeemed",
    userId,
    inviteType: redemption.record.type,
    inviteCode: redemption.record.code,
  });
  routeLogger.info("Invite code redeemed.", {
    inviteType: redemption.record.type,
    inviteCode: redemption.record.code,
    redeemedBy: userId,
  });

  return NextResponse.json(
    {
      ok: true,
      code: redemption.record.code,
      type: redemption.record.type,
      plan: redemption.record.type === "lifetime" ? "lifetime" : "trial",
      trialExpiresAt: responseTrialExpiresAt,
    },
    { headers: rateLimit.headers },
  );
}
