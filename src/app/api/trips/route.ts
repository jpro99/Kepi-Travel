import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserPlan } from "@/lib/billing/planGate";
import { sendDisruptionAlert, sendReservationConfirmation } from "@/lib/email/emailService";
import { trackServerEvent } from "@/lib/analytics/trackServerEvent";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  createTrip,
  deleteTrip,
  getActiveTrip,
  getTrip,
  listTrips,
  setActiveTrip,
  updateTrip,
} from "@/lib/travelAssistant/tripStore";
import { generateId } from "@/lib/utils/generateId";

const TripStageSchema = z.enum(["readiness", "pre-departure", "airport", "arrival", "recovery"]);
const TripStatusSchema = z.enum(["green", "yellow", "red"]);
const TripScenarioSchema = z.enum(["none", "missed-flight", "train-delay", "ride-no-show"]);
const AirportTransportSchema = z.enum([
  "driving-myself",
  "getting-dropped-off",
  "uber-lyft",
  "train-bus",
  "other",
]);
const STAGE_RANK: Record<z.infer<typeof TripStageSchema>, number> = {
  readiness: 0,
  "pre-departure": 1,
  airport: 2,
  arrival: 3,
  recovery: 4,
};

const TripPayloadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(1).max(160),
  startDate: z.string().trim().min(1).max(40),
  endDate: z.string().trim().min(1).max(40),
  stage: TripStageSchema.default("readiness"),
  reservations: z.array(z.any()).default([]),
  tripStatus: TripStatusSchema.default("yellow"),
  minutesToDeparture: z.number().int().min(0).max(10080).default(180),
  activeScenario: TripScenarioSchema.default("none"),
  reviewQueue: z.array(z.any()).default([]),
  readinessItems: z.array(z.any()).default([]),
  updateFeed: z.array(z.any()).default([]),
  airportTransport: AirportTransportSchema.nullable().optional(),
  hotelArrivalTime: z.string().trim().min(1).max(80).nullable().optional(),
});

const TripPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().min(1).max(160).optional(),
  startDate: z.string().trim().min(1).max(40).optional(),
  endDate: z.string().trim().min(1).max(40).optional(),
  stage: TripStageSchema.optional(),
  reservations: z.array(z.any()).optional(),
  tripStatus: TripStatusSchema.optional(),
  minutesToDeparture: z.number().int().min(0).max(10080).optional(),
  activeScenario: TripScenarioSchema.optional(),
  reviewQueue: z.array(z.any()).optional(),
  readinessItems: z.array(z.any()).optional(),
  updateFeed: z.array(z.any()).optional(),
  airportTransport: AirportTransportSchema.nullable().optional(),
  hotelArrivalTime: z.string().trim().min(1).max(80).nullable().optional(),
});

const PostBodySchema = z.object({
  trip: TripPayloadSchema,
  setActive: z.boolean().default(true),
});

const PutBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set-active"),
    id: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().trim().min(1),
    patch: TripPatchSchema,
  }),
]);

const DeleteBodySchema = z.object({
  id: z.string().trim().min(1),
});

async function authorize(req: Request): Promise<
  | {
      ok: true;
      userId: string;
      requestId: string;
      headers: Headers;
      routeLogger: ReturnType<typeof logger.withContext>;
    }
  | { ok: false; response: NextResponse }
> {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/trips",
  });
  if (!userId) {
    routeLogger.warn("Unauthorized trips API request.");
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const isReadOnlyRequest = req.method.toUpperCase() === "GET";
  if (!isReadOnlyRequest) {
    const rateLimit = await enforceRateLimit({
      policyName: "trips-authenticated",
      identifier: userId,
      route: "/api/trips",
      requestId,
    });
    if (!rateLimit.allowed) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Too many trip requests. Please retry shortly." },
          { status: 429, headers: rateLimit.headers },
        ),
      };
    }
    return {
      ok: true,
      userId,
      requestId,
      headers: rateLimit.headers,
      routeLogger,
    };
  }
  return {
    ok: true,
    userId,
    requestId,
    headers: new Headers(),
    routeLogger,
  };
}

export async function GET(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const tripId = url.searchParams.get("id")?.trim() ?? "";
    if (tripId) {
      const trip = await getTrip(tripId, auth.userId);
      return NextResponse.json(
        {
          trip,
        },
        { headers: auth.headers },
      );
    }

    const [trips, activeTrip] = await Promise.all([listTrips(auth.userId), getActiveTrip(auth.userId)]);
    return NextResponse.json(
      {
        trips,
        activeTripId: activeTrip?.id ?? null,
        activeTrip,
      },
      { headers: auth.headers },
    );
  } catch (error) {
    auth.routeLogger.error("Trips GET failed; returning empty fallback.", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      {
        trips: [],
        activeTripId: null,
        activeTrip: null,
        degraded: true,
      },
      { headers: auth.headers },
    );
  }
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  try {
    const [userPlan, existingTrips] = await Promise.all([getUserPlan(auth.userId), listTrips(auth.userId)]);
    if (userPlan === "free" && existingTrips.length >= 1) {
      return NextResponse.json(
        {
          error: "Free tier allows one trip. Upgrade to Pro to create additional trips.",
          requiresProFeature: "multi-trip",
        },
        { status: 402, headers: auth.headers },
      );
    }

    const created = await createTrip(parsed.data.trip, auth.userId);
    if (parsed.data.setActive) {
      await setActiveTrip(created.id, auth.userId);
    }
    const [trips, activeTrip] = await Promise.all([listTrips(auth.userId), getActiveTrip(auth.userId)]);
    auth.routeLogger.info("Trip created.", {
      tripId: created.id,
    });
    void trackServerEvent({
      type: "trip_created",
      userId: auth.userId,
      tripId: created.id,
      plan: userPlan,
    });
    return NextResponse.json(
      {
        trip: created,
        trips,
        activeTripId: activeTrip?.id ?? null,
        activeTrip,
      },
      { headers: auth.headers },
    );
  } catch (error) {
    auth.routeLogger.error("Trips POST failed.", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Trip storage unavailable. Please try again." },
      { status: 503, headers: auth.headers },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    console.log("[/api/trips] PUT validation failed.", {
      body,
      issues: parsed.error.issues,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  try {
    if (parsed.data.action === "set-active") {
      console.log("[/api/trips] PUT set-active received.", {
        userId: auth.userId,
        tripId: parsed.data.id,
      });
      const activeTrip = await setActiveTrip(parsed.data.id, auth.userId);
      if (!activeTrip) {
        return NextResponse.json({ error: "Trip not found" }, { status: 404, headers: auth.headers });
      }
      const trips = await listTrips(auth.userId);
      return NextResponse.json(
        {
          activeTrip,
          activeTripId: activeTrip.id,
          trips,
        },
        { headers: auth.headers },
      );
    }

    const existingTrip = await getTrip(parsed.data.id, auth.userId);
    const patchReservationCount = Array.isArray(parsed.data.patch.reservations) ? parsed.data.patch.reservations.length : null;
    console.log("[/api/trips] PUT update received.", {
      userId: auth.userId,
      tripId: parsed.data.id,
      existingTripFound: Boolean(existingTrip),
      existingReservationCount: existingTrip?.reservations.length ?? null,
      patchReservationCount,
      patchKeys: Object.keys(parsed.data.patch),
    });
    const updated = await updateTrip(parsed.data.id, parsed.data.patch, auth.userId);
    if (!updated) {
      console.log("[/api/trips] PUT update failed: trip not found.", {
        userId: auth.userId,
        tripId: parsed.data.id,
      });
      return NextResponse.json({ error: "Trip not found" }, { status: 404, headers: auth.headers });
    }
    console.log("[/api/trips] PUT update persisted.", {
      userId: auth.userId,
      tripId: parsed.data.id,
      updatedReservationCount: updated.reservations.length,
      reservationDelta:
        typeof patchReservationCount === "number" && typeof existingTrip?.reservations.length === "number"
          ? patchReservationCount - existingTrip.reservations.length
          : null,
    });

    if (existingTrip) {
      const previousStageRank = STAGE_RANK[existingTrip.stage];
      const nextStageRank = STAGE_RANK[updated.stage];
      if (nextStageRank > previousStageRank) {
        void trackServerEvent({
          type: "stage_advanced",
          userId: auth.userId,
          tripId: updated.id,
          newStage: updated.stage,
        });
      }

      const previousReservationIds = new Set(existingTrip.reservations.map((reservation) => reservation.id));
      const addedReservations = updated.reservations.filter((reservation) => !previousReservationIds.has(reservation.id));
      for (const reservation of addedReservations) {
        void trackServerEvent({
          type: "reservation_added",
          userId: auth.userId,
          tripId: updated.id,
          reservationType: reservation.type,
        });
        if (reservation.source === "review-accepted") {
          void sendReservationConfirmation(auth.userId, reservation.id);
        }
      }

      if (
        updated.activeScenario &&
        updated.activeScenario !== "none" &&
        updated.activeScenario !== existingTrip.activeScenario
      ) {
        void trackServerEvent({
          type: "disruption_detected",
          userId: auth.userId,
          tripId: updated.id,
          disruptionType: updated.activeScenario,
        });
        void sendDisruptionAlert(auth.userId, {
          tripId: updated.id,
          tripName: updated.name,
          destination: updated.destination,
          affectedReservationTitle: "Trip disruption scenario",
          disruptionType: updated.activeScenario,
          severity: "warning",
          detail: `Trip switched into ${updated.activeScenario.replaceAll("-", " ")} mode.`,
          scenario: updated.activeScenario,
        });
      }
    }

    const [trips, activeTrip] = await Promise.all([listTrips(auth.userId), getActiveTrip(auth.userId)]);
    return NextResponse.json(
      {
        trip: updated,
        trips,
        activeTripId: activeTrip?.id ?? null,
        activeTrip,
      },
      { headers: auth.headers },
    );
  } catch (error) {
    console.log("[/api/trips] PUT threw error.", {
      error: error instanceof Error ? error.message : "unknown",
    });
    auth.routeLogger.error("Trips PUT failed.", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Trip storage unavailable. Please try again." },
      { status: 503, headers: auth.headers },
    );
  }
}

export async function DELETE(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  try {
    const removed = await deleteTrip(parsed.data.id, auth.userId);
    if (!removed) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404, headers: auth.headers });
    }
    const [trips, activeTrip] = await Promise.all([listTrips(auth.userId), getActiveTrip(auth.userId)]);
    return NextResponse.json(
      {
        ok: true,
        trips,
        activeTripId: activeTrip?.id ?? null,
        activeTrip,
      },
      { headers: auth.headers },
    );
  } catch (error) {
    auth.routeLogger.error("Trips DELETE failed.", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Trip storage unavailable. Please try again." },
      { status: 503, headers: auth.headers },
    );
  }
}
