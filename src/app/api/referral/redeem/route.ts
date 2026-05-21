import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { extendSubscriptionProAccess } from "@/lib/billing/subscriptionStore";
import { sendReferralRewardConfirmation } from "@/lib/email/emailService";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getReferralStats, redeemReferralCode } from "@/lib/referral/referralStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{1,50}$/u),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/referral/redeem",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized referral redeem request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/referral/redeem",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many referral redemption attempts. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsedBody = BodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsedBody.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  const normalizedCode = parsedBody.data.code.toUpperCase().replaceAll(/\s+/g, "");
  const redemption = await redeemReferralCode(normalizedCode, userId);
  if (!redemption.ok) {
    const statusCode =
      redemption.reason === "already-redeemed" ? 409 : redemption.reason === "self-referral" ? 403 : 404;
    return NextResponse.json(
      {
        error:
          redemption.reason === "already-redeemed"
            ? "Referral code already redeemed for this account."
            : redemption.reason === "self-referral"
              ? "You cannot redeem your own referral code."
              : "Referral code is invalid.",
        reason: redemption.reason,
      },
      { status: statusCode, headers: rateLimit.headers },
    );
  }

  await Promise.all([
    extendSubscriptionProAccess(redemption.newUserId, redemption.refereeAwardedDays),
    extendSubscriptionProAccess(redemption.referrerUserId, redemption.referrerAwardedDays),
  ]);

  const referrerStats = await getReferralStats(redemption.referrerUserId);
  await Promise.all([
    sendReferralRewardConfirmation(redemption.newUserId, {
      role: "friend",
      referralCode: redemption.code,
      awardedDays: redemption.refereeAwardedDays,
    }),
    sendReferralRewardConfirmation(redemption.referrerUserId, {
      role: "referrer",
      referralCode: redemption.code,
      awardedDays: redemption.referrerAwardedDays,
      totalDaysEarned: referrerStats.totalDaysEarned,
    }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      referralCode: redemption.code,
      awarded: {
        newUserDays: redemption.refereeAwardedDays,
        referrerDays: redemption.referrerAwardedDays,
      },
    },
    { headers: rateLimit.headers },
  );
}
