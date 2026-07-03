import { NextResponse } from "next/server";
import { z } from "zod";
import { auth, currentUser } from "@clerk/nextjs/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { redeemTripInvite } from "@/lib/travelAssistant/tripCollaborationStore";
import { getTrip } from "@/lib/travelAssistant/tripStore";

export const dynamic = "force-dynamic";

const RedeemSchema = z.object({
  code: z.string().trim().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "trips-authenticated",
    identifier: userId,
    route: "/api/trips/collaborate/redeem",
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please retry shortly." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = RedeemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 422 });
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.username ||
    null;

  const result = await redeemTripInvite({
    code: parsed.data.code,
    userId,
    email,
    name,
  });

  if (!result.ok) {
    const status =
      result.reason === "email-mismatch"
        ? 403
        : result.reason === "trip-missing"
          ? 404
          : 400;
    return NextResponse.json({ error: result.reason }, { status, headers: rateLimit.headers });
  }

  const trip = await getTrip(result.tripId, result.ownerUserId);
  return NextResponse.json(
    {
      ok: true,
      tripId: result.tripId,
      ownerUserId: result.ownerUserId,
      role: result.role,
      tripName: result.tripName,
      alreadyMember: result.alreadyMember,
      trip,
      collaboration: {
        ownerUserId: result.ownerUserId,
        role: result.role,
        isOwner: false,
      },
    },
    { headers: rateLimit.headers },
  );
}
