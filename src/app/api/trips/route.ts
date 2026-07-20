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
  forceSetActiveTripId,
  getActiveTrip,
  getStoredActiveTripId,
  getTrip,
  listTrips,
  setActiveTrip,
  updateTrip,
} from "@/lib/travelAssistant/tripStore";
import {
  listCollaborativeTripsForUser,
  leaveTripCollaboration,
  resolveTripWriteAccess,
  type CollaborativeTrip,
} from "@/lib/travelAssistant/tripCollaboratorStore";
import { MAX_MINUTES_TO_DEPARTURE } from "@/lib/travelAssistant/tripWindow";
import { recoverActiveTripIfEmptyShell } from "@/lib/travelAssistant/tripEmailAttach";
import { generateId } from "@/lib/utils/generateId";

async function listTripsIncludingCollaborations(userId: string) {
  const [owned, collaborative] = await Promise.all([
    listTrips(userId),
    listCollaborativeTripsForUser(userId),
  ]);
  const ownedIds = new Set(owned.map((trip) => trip.id));
  return [...owned, ...collaborative.filter((trip) => !ownedIds.has(trip.id))];
}

function isCollaborativeTrip(trip: { id: string }): trip is CollaborativeTrip {
  return "collaboration" in trip && Boolean((trip as CollaborativeTrip).collaboration);
}

async function resolveActiveTrip(userId: string) {
  // Recover if a Word day-plan forward left the user on an empty shell trip.
  const recovery = await recoverActiveTripIfEmptyShell(userId);
  if (recovery.recovered) {
    logger.info("Recovered active trip from empty shell to trip with reservations.", {
      userId,
      previousActiveId: recovery.previousActiveId,
      recoveredTripId: recovery.trip?.id ?? null,
      reservationCount: recovery.trip?.reservations?.length ?? 0,
    });
  }

  const trips = await listTripsIncludingCollaborations(userId);
  if (trips.length === 0) {
    return { trips, activeTrip: null as Awaited<ReturnType<typeof getTrip>>, activeTripId: null as string | null };
  }

  const storedId = await getStoredActiveTripId(userId);
  const preferred =
    (storedId ? trips.find((trip) => trip.id === storedId) : null) ??
    trips[0] ??
    null;
  if (!preferred) {
    return { trips, activeTrip: null, activeTripId: null };
  }

  if (isCollaborativeTrip(preferred) && preferred.collaboration) {
    const full = await getTrip(preferred.id, preferred.collaboration.ownerUserId);
    return { trips, activeTrip: full ?? preferred, activeTripId: preferred.id };
  }

  const owned = await getTrip(preferred.id, userId);
  return { trips, activeTrip: owned ?? preferred, activeTripId: preferred.id };
}

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
  minutesToDeparture: z.number().int().min(0).max(MAX_MINUTES_TO_DEPARTURE).default(180),
  activeScenario: TripScenarioSchema.default("none"),
  reviewQueue: z.array(z.any()).default([]),
  readinessItems: z.array(z.any()).default([]),
  updateFeed: z.array(z.any()).default([]),
  airportTransport: z.preprocess(
    (value) => (value === "" ? null : value),
    AirportTransportSchema.nullable().optional(),
  ),
  hotelArrivalTime: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(80).nullable().optional(),
  ),
  bookingWizard: z.any().optional(),
  itineraryPlans: z.any().optional(),
  stayDecisions: z.record(z.enum(["needs_hotel", "skip"])).optional(),
});

const TripPatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().min(1).max(160).optional(),
  startDate: z.string().trim().min(1).max(40).optional(),
  endDate: z.string().trim().min(1).max(40).optional(),
  stage: TripStageSchema.optional(),
  reservations: z.array(z.any()).optional(),
  tripStatus: TripStatusSchema.optional(),
  minutesToDeparture: z.number().int().min(0).max(MAX_MINUTES_TO_DEPARTURE).optional(),
  activeScenario: TripScenarioSchema.optional(),
  reviewQueue: z.array(z.any()).optional(),
  readinessItems: z.array(z.any()).optional(),
  updateFeed: z.array(z.any()).optional(),
  airportTransport: z.preprocess(
    (value) => (value === "" ? null : value),
    AirportTransportSchema.nullable().optional(),
  ),
  hotelArrivalTime: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(80).nullable().optional(),
  ),
  bookingWizard: z.any().optional(),
  itineraryPlans: z.any().optional(),
  stayDecisions: z.record(z.enum(["needs_hotel", "skip"])).optional(),
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

const DeleteBodySchema = z.union([
  z.object({
    id: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("delete-trip"),
    id: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("delete-reservation"),
    reservationId: z.string().trim().min(1),
    tripId: z.string().trim().min(1).optional(),
  }),
]);

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
      const owned = await getTrip(tripId, auth.userId);
      if (owned) {
        return NextResponse.json({ trip: owned }, { headers: auth.headers });
      }
      const access = await resolveTripWriteAccess(auth.userId, tripId);
      if (access) {
        const shared = await getTrip(tripId, access.ownerUserId);
        return NextResponse.json(
          {
            trip: shared
              ? {
                  ...shared,
                  collaboration: {
                    ownerUserId: access.ownerUserId,
                    role: access.collaboration?.role ?? "editor",
                    shareToken: access.collaboration?.shareToken ?? "",
                    canEdit: access.canEdit,
                  },
                }
              : null,
          },
          { headers: auth.headers },
        );
      }
      return NextResponse.json({ trip: null }, { headers: auth.headers });
    }

    const { trips, activeTrip, activeTripId } = await resolveActiveTrip(auth.userId);
    return NextResponse.json(
      {
        trips,
        activeTripId,
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
    auth.routeLogger.warn("[/api/trips] PUT validation failed.", {
      issues: parsed.error.issues,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  try {
    if (parsed.data.action === "set-active") {
      auth.routeLogger.info("[/api/trips] PUT set-active received.", {
        userId: auth.userId,
        tripId: parsed.data.id,
      });
      let activeTrip = await setActiveTrip(parsed.data.id, auth.userId);
      if (!activeTrip) {
        const access = await resolveTripWriteAccess(auth.userId, parsed.data.id);
        if (access) {
          activeTrip = await getTrip(parsed.data.id, access.ownerUserId);
          if (activeTrip) {
            await forceSetActiveTripId(parsed.data.id, auth.userId);
          }
        }
      }
      if (!activeTrip) {
        return NextResponse.json({ error: "Trip not found" }, { status: 404, headers: auth.headers });
      }
      const trips = await listTripsIncludingCollaborations(auth.userId);
      return NextResponse.json(
        {
          activeTrip,
          activeTripId: activeTrip.id,
          trips,
        },
        { headers: auth.headers },
      );
    }

    let existingTrip = await getTrip(parsed.data.id, auth.userId);
    let writeOwnerUserId = auth.userId;
    if (!existingTrip) {
      const access = await resolveTripWriteAccess(auth.userId, parsed.data.id);
      if (!access?.canEdit) {
        return NextResponse.json({ error: "Trip not found" }, { status: 404, headers: auth.headers });
      }
      writeOwnerUserId = access.ownerUserId;
      existingTrip = await getTrip(parsed.data.id, access.ownerUserId);
      if (!existingTrip) {
        return NextResponse.json({ error: "Trip not found" }, { status: 404, headers: auth.headers });
      }
    }

    const patchReservationCount = Array.isArray(parsed.data.patch.reservations) ? parsed.data.patch.reservations.length : null;
    auth.routeLogger.info("[/api/trips] PUT update received.", {
      userId: auth.userId,
      tripId: parsed.data.id,
      writeOwnerUserId,
      existingTripFound: Boolean(existingTrip),
      existingReservationCount: existingTrip?.reservations.length ?? null,
      patchReservationCount,
      patchKeys: Object.keys(parsed.data.patch),
    });
    const updated = await updateTrip(parsed.data.id, parsed.data.patch, writeOwnerUserId);
    if (!updated) {
      auth.routeLogger.warn("[/api/trips] PUT update failed: trip not found.", {
        userId: auth.userId,
        tripId: parsed.data.id,
      });
      return NextResponse.json({ error: "Trip not found" }, { status: 404, headers: auth.headers });
    }
    auth.routeLogger.info("[/api/trips] PUT update persisted.", {
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

    const snapshot = await resolveActiveTrip(auth.userId);
    return NextResponse.json(
      {
        trip: updated,
        trips: snapshot.trips,
        activeTripId: snapshot.activeTripId,
        activeTrip: snapshot.activeTrip,
      },
      { headers: auth.headers },
    );
  } catch (error) {
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
    auth.routeLogger.warn("[/api/trips] DELETE validation failed.", {
      issues: parsed.error.issues,
    });
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422, headers: auth.headers },
    );
  }

  try {
    auth.routeLogger.info("[/api/trips] DELETE handler received.", {
      userId: auth.userId,
      payload: parsed.data,
    });
    if ("action" in parsed.data && parsed.data.action === "delete-reservation") {
      const { tripId, reservationId } = parsed.data;
      const ownedTrips = await listTrips(auth.userId);
      let targetTrip =
        (tripId
          ? ownedTrips.find((trip) => trip.id === tripId) ?? null
          : ownedTrips.find((trip) =>
              trip.reservations.some((reservation) => reservation.id === reservationId),
            ) ?? null);
      let writeOwnerUserId = auth.userId;

      if (!targetTrip && tripId) {
        const access = await resolveTripWriteAccess(auth.userId, tripId);
        if (access?.canEdit) {
          writeOwnerUserId = access.ownerUserId;
          targetTrip = await getTrip(tripId, access.ownerUserId);
        }
      } else if (!targetTrip) {
        const collabTrips = await listCollaborativeTripsForUser(auth.userId);
        const match = collabTrips.find((trip) =>
          trip.reservations.some((reservation) => reservation.id === reservationId),
        );
        if (match?.collaboration) {
          const access = await resolveTripWriteAccess(auth.userId, match.id);
          if (access?.canEdit) {
            writeOwnerUserId = access.ownerUserId;
            targetTrip = match;
          }
        }
      }

      if (!targetTrip) {
        return NextResponse.json(
          { error: "Reservation not found in trip." },
          { status: 404, headers: auth.headers },
        );
      }
      const nextReservations = targetTrip.reservations.filter(
        (reservation) => reservation.id !== reservationId,
      );
      if (nextReservations.length === targetTrip.reservations.length) {
        return NextResponse.json(
          { error: "Reservation not found in trip." },
          { status: 404, headers: auth.headers },
        );
      }
      const updatedTrip = await updateTrip(targetTrip.id, { reservations: nextReservations }, writeOwnerUserId);
      if (!updatedTrip) {
        return NextResponse.json({ error: "Trip not found" }, { status: 404, headers: auth.headers });
      }
      const snapshot = await resolveActiveTrip(auth.userId);
      auth.routeLogger.info("[/api/trips] DELETE reservation response sent.", {
        userId: auth.userId,
        tripId: updatedTrip.id,
        writeOwnerUserId,
        beforeCount: targetTrip.reservations.length,
        afterCount: updatedTrip.reservations.length,
      });
      return NextResponse.json(
        {
          ok: true,
          action: "delete-reservation",
          trip: updatedTrip,
          trips: snapshot.trips,
          activeTripId: snapshot.activeTripId,
          activeTrip: snapshot.activeTrip,
          removedReservationId: parsed.data.reservationId,
        },
        { headers: auth.headers },
      );
    }

    const tripId = parsed.data.id;
    const removed = await deleteTrip(tripId, auth.userId);
    if (!removed) {
      // Collaborators leave the shared trip instead of deleting the owner's copy.
      const left = await leaveTripCollaboration({
        collaboratorUserId: auth.userId,
        tripId,
      });
      if (!left) {
        return NextResponse.json({ error: "Trip not found" }, { status: 404, headers: auth.headers });
      }
      const snapshot = await resolveActiveTrip(auth.userId);
      return NextResponse.json(
        {
          ok: true,
          action: "leave-collaboration",
          trips: snapshot.trips,
          activeTripId: snapshot.activeTripId,
          activeTrip: snapshot.activeTrip,
        },
        { headers: auth.headers },
      );
    }
    const snapshot = await resolveActiveTrip(auth.userId);
    auth.routeLogger.info("[/api/trips] DELETE trip response sent.", {
      userId: auth.userId,
      tripId,
    });
    return NextResponse.json(
      {
        ok: true,
        action: "delete-trip",
        trips: snapshot.trips,
        activeTripId: snapshot.activeTripId,
        activeTrip: snapshot.activeTrip,
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
