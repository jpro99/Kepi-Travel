import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { trackServerEvent } from "@/lib/analytics/trackServerEvent";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { joinTripAsCollaborator } from "@/lib/travelAssistant/tripCollaboratorStore";
import { assertShareViewerEmailAccess } from "@/lib/travelAssistant/tripShareAccess";
import { forceSetActiveTripId } from "@/lib/travelAssistant/tripStore";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().trim().min(8).max(40),
  setActive: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/trips/share/join",
  });

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "travel-updates-general",
    identifier: userId,
    route: "/api/trips/share/join",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many join attempts. Please retry shortly." },
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

  const emailOk = await assertShareViewerEmailAccess(parsed.data.token, userId);
  if (!emailOk) {
    return NextResponse.json(
      { error: "Sign in with the invited email to join this trip.", code: "unauthorized" },
      { status: 403, headers: rateLimit.headers },
    );
  }

  const result = await joinTripAsCollaborator({
    token: parsed.data.token,
    collaboratorUserId: userId,
  });

  if (!result.ok) {
    const status =
      result.code === "upgrade-required"
        ? 402
        : result.code === "unauthorized"
          ? 403
          : result.code === "read-only"
            ? 403
            : result.code === "forbidden"
              ? 403
              : 404;
    routeLogger.warn("Trip collaborate join failed.", { code: result.code });
    return NextResponse.json(
      { error: result.error, code: result.code, requiresProFeature: result.code === "upgrade-required" ? "multi-trip" : undefined },
      { status, headers: rateLimit.headers },
    );
  }

  if (parsed.data.setActive) {
    await forceSetActiveTripId(result.trip.id, userId);
  }

  void trackServerEvent({
    type: "trip_collaborator_joined",
    userId,
    tripId: result.trip.id,
    ownerUserId: result.record.ownerUserId,
  });

  routeLogger.info("Trip collaborator joined.", {
    tripId: result.trip.id,
    ownerUserId: result.record.ownerUserId,
  });

  return NextResponse.json(
    {
      ok: true,
      tripId: result.trip.id,
      trip: result.trip,
      collaboration: {
        ownerUserId: result.record.ownerUserId,
        role: result.record.role,
        shareToken: result.record.shareToken,
      },
      redirectTo: `/travel-assistant?tripId=${encodeURIComponent(result.trip.id)}`,
    },
    { headers: rateLimit.headers },
  );
}
