import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminUserId, resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { getSubscriptionRecord, isSubscriptionActive } from "@/lib/billing/subscriptionStore";
import { getInviteCodeRecord, getInviteCodeRedeemedByUser } from "@/lib/invite/inviteCodeStore";
import { logger } from "@/lib/logger";
import { getRedeemedReferralCode } from "@/lib/referral/referralStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AdminUserSummary {
  userId: string;
  email: string;
  signedUpAt: string | null;
  signedUpVia: "organic" | "invite code" | "referral";
  codeUsed: string | null;
  currentPlan: "free" | "pro" | "concierge" | "lifetime" | "trial";
  trialExpiresAt: string | null;
  monthlyRevenueUsd: 0 | 9 | 29;
  status: "active" | "revoked";
  inviteCodeStatus: "active" | "revoked" | "used" | null;
}

function toIsoString(value: unknown): string | null {
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return null;
}

function resolvePrimaryEmail(user: Record<string, unknown>): string {
  const emailAddresses = Array.isArray(user.emailAddresses) ? user.emailAddresses : [];
  const primaryEmailAddressId = typeof user.primaryEmailAddressId === "string" ? user.primaryEmailAddressId : null;
  const primary =
    emailAddresses.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      return (entry as { id?: unknown }).id === primaryEmailAddressId;
    }) ?? emailAddresses[0];
  if (primary && typeof primary === "object" && typeof (primary as { emailAddress?: unknown }).emailAddress === "string") {
    return (primary as { emailAddress: string }).emailAddress;
  }
  return "(no-email)";
}

async function listClerkUsers(): Promise<Array<Record<string, unknown>>> {
  const clerkServerModule = await import("@clerk/nextjs/server");
  const client = await clerkServerModule.clerkClient();
  const allUsers: Array<Record<string, unknown>> = [];
  const pageSize = 100;
  let offset = 0;
  while (offset < 1000) {
    const page = (await client.users.getUserList({
      limit: pageSize,
      offset,
    })) as unknown;
    const batch = Array.isArray((page as { data?: unknown[] }).data)
      ? ((page as { data: unknown[] }).data.filter(
          (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object",
        ) as Array<Record<string, unknown>>)
      : [];
    if (batch.length === 0) {
      break;
    }
    allUsers.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
    offset += batch.length;
  }
  return allUsers;
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/admin/users",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized admin users request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminUserId(userId)) {
    routeLogger.warn("Forbidden admin users request from non-admin user.");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let clerkUsers: Array<Record<string, unknown>> = [];
  try {
    clerkUsers = await listClerkUsers();
  } catch (error) {
    routeLogger.error("Failed to list Clerk users for admin panel.", error instanceof Error ? error : undefined);
    return NextResponse.json({ error: "Unable to load users from Clerk." }, { status: 500 });
  }

  const nowMs = Date.now();
  const summaries = await Promise.all(
    clerkUsers.map(async (user): Promise<AdminUserSummary> => {
      const targetUserId = typeof user.id === "string" ? user.id : "";
      const email = resolvePrimaryEmail(user);
      const signedUpAt = toIsoString(user.createdAt);
      const subscription = await getSubscriptionRecord(targetUserId);
      const inviteCode = await getInviteCodeRedeemedByUser(targetUserId);
      const inviteRecord = inviteCode ? await getInviteCodeRecord(inviteCode) : null;
      const referralCode = inviteCode ? null : await getRedeemedReferralCode(targetUserId);

      const hasActiveTrial =
        typeof subscription.trialExpiresAt === "string" && Date.parse(subscription.trialExpiresAt) > nowMs;
      const currentPlan: AdminUserSummary["currentPlan"] = subscription.lifetimePlan
        ? "lifetime"
        : hasActiveTrial
          ? "trial"
          : isSubscriptionActive(subscription)
            ? subscription.plan
            : "free";

      const monthlyRevenueUsd: AdminUserSummary["monthlyRevenueUsd"] =
        currentPlan === "concierge"
          ? 29
          : currentPlan === "pro" && Boolean(subscription.stripeSubscriptionId)
            ? 9
            : 0;

      return {
        userId: targetUserId,
        email,
        signedUpAt,
        signedUpVia: inviteCode ? "invite code" : referralCode ? "referral" : "organic",
        codeUsed: inviteCode ?? referralCode,
        currentPlan,
        trialExpiresAt: hasActiveTrial ? subscription.trialExpiresAt : null,
        monthlyRevenueUsd,
        status: inviteRecord?.status === "revoked" ? "revoked" : "active",
        inviteCodeStatus: inviteRecord?.status ?? null,
      };
    }),
  );

  return NextResponse.json({ users: summaries });
}
