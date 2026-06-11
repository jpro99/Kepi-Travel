import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getKepiPassRecord, redeemKepiPass } from "@/lib/kepi-pass/passStore";
import { setSubscriptionRecord, getSubscriptionRecord, BillingSubscriptionRecord } from "@/lib/billing/subscriptionStore";
import { CLERK_METADATA_LIFETIME_KEY, CLERK_METADATA_PLAN_KEY } from "@/lib/billing/clerkMetadataKeys";
import { KEPI_PLAN_COOKIE_NAME, KEPI_PLAN_LIFETIME_VALUE, KEPI_PLAN_COOKIE_MAX_AGE_SECONDS } from "@/lib/billing/planCookie";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  passId: z.string().trim().startsWith("kp_"),
});

async function applyKepiPassSubscription(userId: string, passType: "GOLDEN" | "SILVER") {
  const plan = passType === "GOLDEN" ? "lifetime" : "trial";
  const trialExpiresAt = passType === "SILVER" ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null;

  // 1. Update Clerk Metadata
  await clerkClient.users.updateUserMetadata(userId, {
    privateMetadata: {
      [CLERK_METADATA_PLAN_KEY]: plan,
      [CLERK_METADATA_LIFETIME_KEY]: plan === "lifetime",
      kepiPassRedeemedAt: new Date().toISOString(),
    },
  });

  // 2. Update local subscription store
  const existingSubscription = await getSubscriptionRecord(userId);
  const newRecord: BillingSubscriptionRecord = {
    ...existingSubscription,
    plan: "pro",
    validUntil: trialExpiresAt,
    lifetimePlan: plan === "lifetime",
    trialExpiresAt,
  };
  await setSubscriptionRecord(userId, newRecord);

  return { plan, trialExpiresAt };
}

export async function POST(req: Request) {
  const { userId } = await auth();
  const routeLogger = logger.withContext({ userId, route: "/api/kepi-pass/redeem" });

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 422 });
  }

  const { passId } = parsed.data;
  const passRecord = await getKepiPassRecord(passId);

  if (!passRecord) {
    return NextResponse.json({ error: "Kepi Pass not found." }, { status: 404 });
  }

  // Security Check: Verify email
  const user = await clerkClient.users.getUser(userId);
  const userEmails = user.emailAddresses.map(e => e.emailAddress.toLowerCase());
  if (!userEmails.includes(passRecord.intendedEmail.toLowerCase())) {
    routeLogger.warn("Kepi Pass email mismatch.", { intendedEmail: passRecord.intendedEmail, userEmails });
    return NextResponse.json({ error: "This Kepi Pass is intended for a different email address." }, { status: 403 });
  }

  if (passRecord.status === "redeemed") {
      if (passRecord.redeemedBy === userId) {
          return NextResponse.json({ ok: true, restored: true, message: "Your Kepi Pass plan is already active." });
      }
      return NextResponse.json({ error: "This Kepi Pass has already been redeemed by another user." }, { status: 409 });
  }

  // Redeem the pass
  await redeemKepiPass(passId, userId);

  // Apply the subscription benefits
  const { plan, trialExpiresAt } = await applyKepiPassSubscription(userId, passRecord.type);

  routeLogger.info("Kepi Pass Redeemed Successfully", { passId, passType: passRecord.type });

  const response = NextResponse.json({ ok: true, plan, trialExpiresAt });

  // Set lifetime cookie for Golden passes
  if (plan === "lifetime") {
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

  return response;
}
