import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  createReferralCode,
  getReferralCode,
  getReferralStats,
} from "@/lib/referral/referralStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildReferralLink(code: string): string {
  const appBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    "http://localhost:3000";
  return `${appBase.replace(/\/$/u, "")}/refer/${encodeURIComponent(code)}`;
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || randomUUID();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/referral",
  });

  if (!userId) {
    routeLogger.warn("Unauthorized referral status request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/referral",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many referral requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  const existingCode = await getReferralCode(userId);
  const code = existingCode ?? (await createReferralCode(userId));
  const stats = await getReferralStats(userId);

  return NextResponse.json(
    {
      code,
      stats,
      referralLink: buildReferralLink(code),
    },
    { headers: rateLimit.headers },
  );
}
