import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { getSubscriptionRecord, setSubscriptionRecord } from "@/lib/billing/subscriptionStore";
import { getInviteCodeRedeemedByUser, revokeInviteCode } from "@/lib/invite/inviteCodeStore";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  code: z.string().trim().optional(),
  userId: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/admin/revoke",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized admin revoke request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUserId(userId)) {
    routeLogger.warn("Forbidden admin revoke request from non-admin user.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/admin/revoke",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many revoke requests. Please retry shortly." },
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

  let code = parsed.data.code?.trim() ?? "";
  if (!code && parsed.data.userId) {
    const redeemedCode = await getInviteCodeRedeemedByUser(parsed.data.userId);
    code = redeemedCode ?? "";
  }
  if (!code) {
    return NextResponse.json({ error: "Invite code not provided." }, { status: 422, headers: rateLimit.headers });
  }

  const revokedRecord = await revokeInviteCode(code);
  if (!revokedRecord) {
    return NextResponse.json({ error: "Invite code not found." }, { status: 404, headers: rateLimit.headers });
  }

  const targetUserId = revokedRecord.usedBy ?? parsed.data.userId ?? null;
  if (targetUserId) {
    const existingSubscription = await getSubscriptionRecord(targetUserId);
    await setSubscriptionRecord(targetUserId, {
      plan: "free",
      stripeCustomerId: existingSubscription.stripeCustomerId,
      stripeSubscriptionId: null,
      validUntil: null,
      lifetimePlan: false,
      trialExpiresAt: null,
    });
  }

  routeLogger.info("Invite code revoked and user downgraded.", {
    inviteCode: revokedRecord.code,
    downgradedUserId: targetUserId,
  });

  return NextResponse.json({ ok: true, code: revokedRecord.code, downgradedUserId: targetUserId }, { headers: rateLimit.headers });
}
