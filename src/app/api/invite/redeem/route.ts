import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { trackServerEvent } from "@/lib/analytics/trackServerEvent";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import {
  getSubscriptionRecord,
  getSubscriptionStorageKey,
  setSubscriptionRecord,
  type BillingSubscriptionRecord,
} from "@/lib/billing/subscriptionStore";
import {
  KEPI_PLAN_COOKIE_MAX_AGE_SECONDS,
  KEPI_PLAN_COOKIE_NAME,
  KEPI_PLAN_LIFETIME_VALUE,
} from "@/lib/billing/planCookie";
import { getInviteCodeRecord, getInviteCodeRedeemedByUser, redeemInviteCode } from "@/lib/invite/inviteCodeStore";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

// Invite Code: admin-generated code shared directly with a friend/family member.
const BodySchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9-]{1,50}$/u),
});

function trialExpiryFromInviteUsage(usedAt: string | null): string {
  const usedAtMs = usedAt ? Date.parse(usedAt) : Number.NaN;
  const baseMs = Number.isNaN(usedAtMs) ? Date.now() : usedAtMs;
  return new Date(baseMs + 30 * DAY_IN_MS).toISOString();
}

function applyLifetimePlanCookie(response: NextResponse): void {
  response.cookies.set({
    name: KEPI_PLAN_COOKIE_NAME,
    value: KEPI_PLAN_LIFETIME_VALUE,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: KEPI_PLAN_COOKIE_MAX_AGE_SECONDS,
  });
}

async function persistInviteDerivedSubscription(args: {
  userId: string;
  inviteType: "lifetime" | "trial-30";
  existingSubscription: Awaited<ReturnType<typeof getSubscriptionRecord>>;
  usedAt: string | null;
}): Promise<{ plan: "lifetime" | "trial"; trialExpiresAt: string | null; savedRecord: BillingSubscriptionRecord }> {
  if (args.inviteType === "lifetime") {
    const nextRecord: BillingSubscriptionRecord = {
      plan: "pro",
      stripeCustomerId: args.existingSubscription.stripeCustomerId,
      stripeSubscriptionId: null,
      validUntil: null,
      lifetimePlan: true,
      trialExpiresAt: null,
    };
    await setSubscriptionRecord(args.userId, nextRecord);
    return { plan: "lifetime", trialExpiresAt: null, savedRecord: nextRecord };
  }
  const trialExpiresAt = trialExpiryFromInviteUsage(args.usedAt);
  const nextRecord: BillingSubscriptionRecord = {
    plan: "pro",
    stripeCustomerId: args.existingSubscription.stripeCustomerId,
    stripeSubscriptionId: null,
    validUntil: trialExpiresAt,
    lifetimePlan: false,
    trialExpiresAt,
  };
  await setSubscriptionRecord(args.userId, nextRecord);
  return { plan: "trial", trialExpiresAt, savedRecord: nextRecord };
}

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

  // Invite Code normalization only (Referral Codes redeem via /api/referral/redeem).
  const normalizedCode = parsed.data.code.toUpperCase().trim();
  const redemption = await redeemInviteCode(normalizedCode, userId);
  if (!redemption.ok) {
    if (redemption.reason === "already-redeemed") {
      const redeemedCode = await getInviteCodeRedeemedByUser(userId);
      const redeemedInviteRecord = redeemedCode ? await getInviteCodeRecord(redeemedCode) : null;
      if (redeemedInviteRecord?.usedBy === userId) {
        const existingSubscription = await getSubscriptionRecord(userId);
        const hasInviteDerivedAccess =
          existingSubscription.lifetimePlan ||
          (typeof existingSubscription.trialExpiresAt === "string" &&
            Date.parse(existingSubscription.trialExpiresAt) > Date.now());
        const persisted =
          hasInviteDerivedAccess && (existingSubscription.lifetimePlan || existingSubscription.trialExpiresAt)
            ? {
                plan: existingSubscription.lifetimePlan ? "lifetime" : "trial",
                trialExpiresAt: existingSubscription.trialExpiresAt,
                savedRecord: existingSubscription,
              }
            : await persistInviteDerivedSubscription({
                userId,
                inviteType: redeemedInviteRecord.type,
                existingSubscription,
                usedAt: redeemedInviteRecord.usedAt,
              });
        const subscriptionStorageKey = getSubscriptionStorageKey(userId);
        console.info("[invite/redeem] restored subscription persistence", {
          userId,
          subscriptionStorageKey,
          persistedRecord: persisted.savedRecord,
        });
        routeLogger.info("Invite Code subscription restored.", {
          subscriptionStorageKey,
          persistedRecord: persisted.savedRecord,
        });
        const response = NextResponse.json(
          {
            ok: true,
            restored: true,
            code: redeemedInviteRecord.code,
            type: redeemedInviteRecord.type,
            plan: persisted.plan,
            trialExpiresAt: persisted.trialExpiresAt,
          },
          { headers: rateLimit.headers },
        );
        if (persisted.plan === "lifetime") {
          applyLifetimePlanCookie(response);
        }
        return response;
      }
    }
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
            ? "An Invite Code has already been redeemed for this account."
            : redemption.reason === "code-revoked"
              ? "This Invite Code has been revoked."
              : redemption.reason === "code-used"
                ? "This Invite Code has already been used."
                : "Invite Code is invalid.",
        reason: redemption.reason,
      },
      { status: statusCode, headers: rateLimit.headers },
    );
  }

  const existingSubscription = await getSubscriptionRecord(userId);
  const persisted = await persistInviteDerivedSubscription({
    userId,
    inviteType: redemption.record.type,
    existingSubscription,
    usedAt: redemption.record.usedAt,
  });
  const subscriptionStorageKey = getSubscriptionStorageKey(userId);
  console.info("[invite/redeem] saved subscription persistence", {
    userId,
    subscriptionStorageKey,
    persistedRecord: persisted.savedRecord,
  });
  routeLogger.info("Invite Code subscription persisted.", {
    subscriptionStorageKey,
    persistedRecord: persisted.savedRecord,
  });

  void trackServerEvent({
    type: "invite_code_redeemed",
    userId,
    inviteType: redemption.record.type,
    inviteCode: redemption.record.code,
  });
  routeLogger.info("Invite Code redeemed.", {
    inviteType: redemption.record.type,
    inviteCode: redemption.record.code,
    redeemedBy: userId,
  });

  const response = NextResponse.json(
    {
      ok: true,
      code: redemption.record.code,
      type: redemption.record.type,
      plan: persisted.plan,
      trialExpiresAt: persisted.trialExpiresAt,
    },
    { headers: rateLimit.headers },
  );
  if (persisted.plan === "lifetime") {
    applyLifetimePlanCookie(response);
  }
  return response;
}
