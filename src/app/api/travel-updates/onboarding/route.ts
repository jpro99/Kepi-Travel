import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { kvStoreDel, kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { listTrips } from "@/lib/travelAssistant/tripStore";
import { generateId } from "@/lib/utils/generateId";
import { getSubscriptionRecord, isSubscriptionActive } from "@/lib/billing/subscriptionStore";

const ONBOARDING_COMPLETE_KEY = "onboarding-complete";
const ONBOARDING_PROGRESS_KEY = "onboarding-progress";
const ONBOARDING_NOTIFICATIONS_SEEN_KEY = "onboarding:notifications:seen";
const TOTAL_ONBOARDING_STEPS = 5;

const TripDraftSchema = z.object({
  tripName: z.string().max(120).default(""),
  destination: z.string().max(120).default(""),
  departureDate: z.string().max(20).default(""),
});

// Invite Code: admin-generated, friend/family code (supports hyphens).
const InviteCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,50}$/u).or(z.literal(""));
// Referral Code: user-shared referral identifier.
const ReferralCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,50}$/u).or(z.literal(""));

const OnboardingProgressSchema = z.object({
  currentStep: z.number().int().min(1).max(TOTAL_ONBOARDING_STEPS),
  tripDraft: TripDraftSchema,
  inviteCode: InviteCodeSchema.default(""),
  inviteRedeemedAt: z.string().min(1).nullable().default(null),
  referralCode: ReferralCodeSchema.default(""),
  referralRedeemedAt: z.string().min(1).nullable().default(null),
  updatedAt: z.string(),
});

const PutBodySchema = z.object({
  complete: z.boolean().optional(),
  notificationsSeen: z.boolean().optional(),
  currentStep: z.number().int().min(1).max(TOTAL_ONBOARDING_STEPS).optional(),
  tripDraft: TripDraftSchema.optional(),
  inviteCode: InviteCodeSchema.optional(),
  inviteRedeemedAt: z.string().min(1).nullable().optional(),
  referralCode: ReferralCodeSchema.optional(),
  referralRedeemedAt: z.string().min(1).nullable().optional(),
});

function defaultTripDraft(): z.infer<typeof TripDraftSchema> {
  return {
    tripName: "",
    destination: "",
    departureDate: "",
  };
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/travel-updates/onboarding",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized onboarding status request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/travel-updates/onboarding",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many onboarding requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let isComplete = Boolean(await kvStoreGet<boolean>(ONBOARDING_COMPLETE_KEY, { userId }));
  const notificationsSeenRaw = await kvStoreGet<string | boolean | null>(ONBOARDING_NOTIFICATIONS_SEEN_KEY, { userId });
  const notificationsSeen = Boolean(notificationsSeenRaw);

  // Auto-complete onboarding for users with active subscription or lifetime access.
  // Prevents the modal from showing on every refresh for paying users whose
  // completion flag wasn't stored (e.g. redeemed a code before running onboarding).
  if (!isComplete) {
    try {
      const sub = await getSubscriptionRecord(userId);
      if (isSubscriptionActive(sub) || sub.lifetimePlan || (sub.trialExpiresAt && Date.parse(sub.trialExpiresAt) > Date.now())) {
        await kvStoreSet<boolean>(ONBOARDING_COMPLETE_KEY, true, { userId });
        isComplete = true;
      }
    } catch {
      // Non-fatal — proceed with normal onboarding flow
    }
  }

  // Returning users with saved trips must never be forced through onboarding again.
  if (!isComplete) {
    try {
      const existingTrips = await listTrips(userId);
      if (existingTrips.length > 0) {
        await kvStoreSet<boolean>(ONBOARDING_COMPLETE_KEY, true, { userId });
        await kvStoreDel(ONBOARDING_PROGRESS_KEY, { userId });
        isComplete = true;
        routeLogger.info("Onboarding auto-completed for returning user with trips.", {
          tripCount: existingTrips.length,
        });
      }
    } catch {
      // Non-fatal — proceed with normal onboarding flow
    }
  }

  if (isComplete) {
    return NextResponse.json(
      {
        complete: true,
        notificationsSeen,
        currentStep: TOTAL_ONBOARDING_STEPS,
        tripDraft: defaultTripDraft(),
        inviteCode: "",
        inviteRedeemedAt: null,
        referralCode: "",
        referralRedeemedAt: null,
      },
      { headers: rateLimit.headers },
    );
  }

  const progress = await kvStoreGet<unknown>(ONBOARDING_PROGRESS_KEY, { userId });
  const parsedProgress = OnboardingProgressSchema.safeParse(progress);

  return NextResponse.json(
    {
      complete: false,
      notificationsSeen,
      currentStep: parsedProgress.success ? parsedProgress.data.currentStep : 1,
      tripDraft: parsedProgress.success ? parsedProgress.data.tripDraft : defaultTripDraft(),
      inviteCode: parsedProgress.success ? parsedProgress.data.inviteCode : "",
      inviteRedeemedAt: parsedProgress.success ? parsedProgress.data.inviteRedeemedAt : null,
      referralCode: parsedProgress.success ? parsedProgress.data.referralCode : "",
      referralRedeemedAt: parsedProgress.success ? parsedProgress.data.referralRedeemedAt : null,
    },
    { headers: rateLimit.headers },
  );
}

export async function PUT(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/travel-updates/onboarding",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized onboarding update request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/travel-updates/onboarding",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many onboarding requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsedBody = PutBodySchema.safeParse(body);
  if (!parsedBody.success) {
    routeLogger.warn("Onboarding update payload validation failed.", {
      issues: parsedBody.error.issues.length,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsedBody.error.flatten() },
      { status: 422, headers: rateLimit.headers },
    );
  }

  if (parsedBody.data.complete === true) {
    if (parsedBody.data.notificationsSeen === true) {
      await kvStoreSet(ONBOARDING_NOTIFICATIONS_SEEN_KEY, new Date().toISOString(), { userId });
    }
    await kvStoreSet<boolean>(ONBOARDING_COMPLETE_KEY, true, { userId });
    await kvStoreDel(ONBOARDING_PROGRESS_KEY, { userId });
    routeLogger.info("Onboarding marked complete.");
    return NextResponse.json({ ok: true, complete: true }, { headers: rateLimit.headers });
  }

  const hasProgressFields =
    parsedBody.data.currentStep !== undefined ||
    parsedBody.data.tripDraft !== undefined ||
    parsedBody.data.inviteCode !== undefined ||
    parsedBody.data.inviteRedeemedAt !== undefined ||
    parsedBody.data.referralCode !== undefined ||
    parsedBody.data.referralRedeemedAt !== undefined;

  if (parsedBody.data.notificationsSeen === true && !hasProgressFields) {
    await kvStoreSet(ONBOARDING_NOTIFICATIONS_SEEN_KEY, new Date().toISOString(), { userId });
    routeLogger.info("Onboarding notifications preference saved.");
    return NextResponse.json({ ok: true, notificationsSeen: true }, { headers: rateLimit.headers });
  }

  const alreadyComplete = Boolean(await kvStoreGet<boolean>(ONBOARDING_COMPLETE_KEY, { userId }));
  if (alreadyComplete) {
    if (parsedBody.data.notificationsSeen === true) {
      await kvStoreSet(ONBOARDING_NOTIFICATIONS_SEEN_KEY, new Date().toISOString(), { userId });
    }
    routeLogger.info("Ignoring onboarding progress update for already-complete user.");
    return NextResponse.json(
      { ok: true, complete: true, notificationsSeen: Boolean(await kvStoreGet(ONBOARDING_NOTIFICATIONS_SEEN_KEY, { userId })) },
      { headers: rateLimit.headers },
    );
  }

  if (parsedBody.data.notificationsSeen === true) {
    await kvStoreSet(ONBOARDING_NOTIFICATIONS_SEEN_KEY, new Date().toISOString(), { userId });
  }

  const existingProgressRaw = await kvStoreGet<unknown>(ONBOARDING_PROGRESS_KEY, { userId });
  const existingProgress = OnboardingProgressSchema.safeParse(existingProgressRaw);
  const previous = existingProgress.success
    ? existingProgress.data
    : {
        currentStep: 1,
        tripDraft: defaultTripDraft(),
        inviteCode: "",
        inviteRedeemedAt: null as string | null,
        referralCode: "",
        referralRedeemedAt: null as string | null,
      };

  const progressPayload = {
    currentStep: parsedBody.data.currentStep ?? previous.currentStep,
    tripDraft: parsedBody.data.tripDraft ?? previous.tripDraft,
    inviteCode: parsedBody.data.inviteCode ?? previous.inviteCode,
    inviteRedeemedAt: parsedBody.data.inviteRedeemedAt === undefined ? previous.inviteRedeemedAt : parsedBody.data.inviteRedeemedAt,
    referralCode: parsedBody.data.referralCode ?? previous.referralCode,
    referralRedeemedAt:
      parsedBody.data.referralRedeemedAt === undefined ? previous.referralRedeemedAt : parsedBody.data.referralRedeemedAt,
    updatedAt: new Date().toISOString(),
  };

  await kvStoreSet(ONBOARDING_PROGRESS_KEY, progressPayload, { userId });
  const notificationsSeen = Boolean(
    await kvStoreGet<string | boolean | null>(ONBOARDING_NOTIFICATIONS_SEEN_KEY, { userId }),
  );
  routeLogger.info("Onboarding progress persisted.", {
    currentStep: progressPayload.currentStep,
  });

  return NextResponse.json(
    {
      ok: true,
      complete: false,
      notificationsSeen,
      currentStep: progressPayload.currentStep,
      tripDraft: progressPayload.tripDraft,
      inviteCode: progressPayload.inviteCode,
      inviteRedeemedAt: progressPayload.inviteRedeemedAt,
      referralCode: progressPayload.referralCode,
      referralRedeemedAt: progressPayload.referralRedeemedAt,
    },
    { headers: rateLimit.headers },
  );
}
