import type {
  SessionReadinessItem,
  SessionReservation,
  SessionReviewItem,
} from "@/lib/travelAssistant/clientSessionState";
import type { TripFlowStage } from "@/lib/travelAssistant/tripFlowControls";
import { kvStoreDel, kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";

const TRIPS_KEY = "trips";
const ACTIVE_TRIP_ID_KEY = "active-trip-id";

export type TripStatus = "green" | "yellow" | "red";
export type TripScenario = "none" | "missed-flight" | "train-delay" | "ride-no-show";
export type TripAirportTransport = "driving-myself" | "getting-dropped-off" | "uber-lyft" | "train-bus" | "other";

export interface TripFeedItem {
  id: string;
  reservationId: string;
  kind: string;
  severity: string;
  summary: string;
  detail: string;
  provider: string;
  appliedAt: string;
}

export interface TravelTrip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  stage: TripFlowStage;
  reservations: SessionReservation[];
  createdAt: string;
  tripStatus?: TripStatus;
  minutesToDeparture?: number;
  activeScenario?: TripScenario;
  reviewQueue?: SessionReviewItem[];
  readinessItems?: SessionReadinessItem[];
  updateFeed?: TripFeedItem[];
  airportTransport?: TripAirportTransport | null;
  hotelArrivalTime?: string | null;
}

export interface CreateTripInput {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  stage?: TripFlowStage;
  reservations?: SessionReservation[];
  tripStatus?: TripStatus;
  minutesToDeparture?: number;
  activeScenario?: TripScenario;
  reviewQueue?: SessionReviewItem[];
  readinessItems?: SessionReadinessItem[];
  updateFeed?: TripFeedItem[];
  airportTransport?: TripAirportTransport | null;
  hotelArrivalTime?: string | null;
}

export type UpdateTripInput = Partial<Omit<TravelTrip, "id" | "createdAt">>;

export interface DeleteReservationFromTripInput {
  reservationId: string;
  tripId?: string;
}

export interface DeleteReservationFromTripResult {
  removed: boolean;
  trip: TravelTrip | null;
  beforeCount: number;
  afterCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStringArrayValue<T>(value: unknown): T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value as T[];
}

function sanitizeTrip(raw: unknown): TravelTrip | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.destination !== "string" ||
    typeof raw.startDate !== "string" ||
    typeof raw.endDate !== "string" ||
    typeof raw.stage !== "string" ||
    typeof raw.createdAt !== "string" ||
    !Array.isArray(raw.reservations)
  ) {
    return null;
  }

  const stage = raw.stage as TripFlowStage;
  const tripStatus =
    raw.tripStatus === "green" || raw.tripStatus === "yellow" || raw.tripStatus === "red"
      ? raw.tripStatus
      : undefined;
  const activeScenario =
    raw.activeScenario === "none" ||
    raw.activeScenario === "missed-flight" ||
    raw.activeScenario === "train-delay" ||
    raw.activeScenario === "ride-no-show"
      ? raw.activeScenario
      : undefined;
  const minutesToDeparture =
    typeof raw.minutesToDeparture === "number" ? Math.round(raw.minutesToDeparture) : undefined;
  const airportTransport =
    raw.airportTransport === "driving-myself" ||
    raw.airportTransport === "getting-dropped-off" ||
    raw.airportTransport === "uber-lyft" ||
    raw.airportTransport === "train-bus" ||
    raw.airportTransport === "other"
      ? raw.airportTransport
      : null;
  const hotelArrivalTime = typeof raw.hotelArrivalTime === "string" && raw.hotelArrivalTime.trim().length > 0
    ? raw.hotelArrivalTime.trim()
    : null;

  return {
    id: raw.id,
    name: raw.name,
    destination: raw.destination,
    startDate: raw.startDate,
    endDate: raw.endDate,
    stage,
    reservations: raw.reservations as SessionReservation[],
    createdAt: raw.createdAt,
    tripStatus,
    minutesToDeparture,
    activeScenario,
    reviewQueue: asStringArrayValue<SessionReviewItem>(raw.reviewQueue),
    readinessItems: asStringArrayValue<SessionReadinessItem>(raw.readinessItems),
    updateFeed: asStringArrayValue<TripFeedItem>(raw.updateFeed),
    airportTransport,
    hotelArrivalTime,
  };
}

async function readTrips(userId?: string): Promise<TravelTrip[]> {
  let stored: unknown = null;
  try {
    stored = await kvStoreGet<unknown>(TRIPS_KEY, { userId });
  } catch {
    return [];
  }
  if (!Array.isArray(stored)) {
    return [];
  }
  const trips = stored.map(sanitizeTrip).filter((trip): trip is TravelTrip => trip !== null);
  trips.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  return trips;
}

async function writeTrips(trips: TravelTrip[], userId?: string): Promise<void> {
  try {
    await kvStoreSet(TRIPS_KEY, trips, { userId });
  } catch {
    // Storage failures are handled by callers as degraded mode.
  }
}

export async function listTrips(userId?: string): Promise<TravelTrip[]> {
  return readTrips(userId);
}

export async function getTrip(id: string, userId?: string): Promise<TravelTrip | null> {
  const trips = await readTrips(userId);
  return trips.find((trip) => trip.id === id) ?? null;
}

export async function createTrip(input: CreateTripInput, userId?: string): Promise<TravelTrip> {
  const trips = await readTrips(userId);
  const createdAt = new Date().toISOString();
  const trip: TravelTrip = {
    id: generateId(),
    name: input.name.trim(),
    destination: input.destination.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    stage: input.stage ?? "readiness",
    reservations: input.reservations ? [...input.reservations] : [],
    createdAt,
    tripStatus: input.tripStatus ?? "yellow",
    minutesToDeparture: input.minutesToDeparture ?? 180,
    activeScenario: input.activeScenario ?? "none",
    reviewQueue: input.reviewQueue ? [...input.reviewQueue] : [],
    readinessItems: input.readinessItems ? [...input.readinessItems] : [],
    updateFeed: input.updateFeed ? [...input.updateFeed] : [],
    airportTransport: input.airportTransport ?? null,
    hotelArrivalTime: input.hotelArrivalTime ?? null,
  };
  const nextTrips = [...trips, trip];
  await writeTrips(nextTrips, userId);
  let activeTripId: string | null = null;
  try {
    activeTripId = await kvStoreGet<string>(ACTIVE_TRIP_ID_KEY, { userId });
  } catch {
    activeTripId = null;
  }
  if (!activeTripId) {
    try {
      await kvStoreSet(ACTIVE_TRIP_ID_KEY, trip.id, { userId });
    } catch {
      // Non-critical: trip still exists in in-memory state.
    }
  }
  return trip;
}

export async function updateTrip(
  id: string,
  patch: UpdateTripInput,
  userId?: string,
): Promise<TravelTrip | null> {
  const trips = await readTrips(userId);
  const index = trips.findIndex((trip) => trip.id === id);
  if (index < 0) {
    return null;
  }
  const existing = trips[index];
  if (!existing) {
    return null;
  }
  const updated: TravelTrip = {
    ...existing,
    ...patch,
    reservations: patch.reservations ? [...patch.reservations] : existing.reservations,
  };
  const nextTrips = [...trips];
  nextTrips[index] = updated;
  await writeTrips(nextTrips, userId);
  return updated;
}

export async function deleteTrip(id: string, userId?: string): Promise<boolean> {
  const trips = await readTrips(userId);
  const nextTrips = trips.filter((trip) => trip.id !== id);
  if (nextTrips.length === trips.length) {
    return false;
  }
  await writeTrips(nextTrips, userId);
  let activeTripId: string | null = null;
  try {
    activeTripId = await kvStoreGet<string>(ACTIVE_TRIP_ID_KEY, { userId });
  } catch {
    activeTripId = null;
  }
  if (activeTripId === id) {
    if (nextTrips[0]) {
      try {
        await kvStoreSet(ACTIVE_TRIP_ID_KEY, nextTrips[0].id, { userId });
      } catch {
        // Non-critical in degraded storage mode.
      }
    } else {
      try {
        await kvStoreDel(ACTIVE_TRIP_ID_KEY, { userId });
      } catch {
        // Non-critical in degraded storage mode.
      }
    }
  }
  return true;
}

export async function deleteReservationFromTrip(
  input: DeleteReservationFromTripInput,
  userId?: string,
): Promise<DeleteReservationFromTripResult> {
  const reservationId = input.reservationId.trim();
  const preferredTripId = input.tripId?.trim() || null;
  const trips = await readTrips(userId);

  if (!reservationId) {
    return {
      removed: false,
      trip: null,
      beforeCount: 0,
      afterCount: 0,
    };
  }

  const targetTripIndex = preferredTripId
    ? trips.findIndex((trip) => trip.id === preferredTripId)
    : trips.findIndex((trip) => trip.reservations.some((reservation) => reservation.id === reservationId));
  if (targetTripIndex < 0) {
    return {
      removed: false,
      trip: null,
      beforeCount: 0,
      afterCount: 0,
    };
  }

  const targetTrip = trips[targetTripIndex];
  if (!targetTrip) {
    return {
      removed: false,
      trip: null,
      beforeCount: 0,
      afterCount: 0,
    };
  }
  const nextReservations = targetTrip.reservations.filter((reservation) => reservation.id !== reservationId);
  if (nextReservations.length === targetTrip.reservations.length) {
    return {
      removed: false,
      trip: targetTrip,
      beforeCount: targetTrip.reservations.length,
      afterCount: targetTrip.reservations.length,
    };
  }

  const updatedTrip: TravelTrip = {
    ...targetTrip,
    reservations: nextReservations,
  };
  const nextTrips = [...trips];
  nextTrips[targetTripIndex] = updatedTrip;
  await writeTrips(nextTrips, userId);
  return {
    removed: true,
    trip: updatedTrip,
    beforeCount: targetTrip.reservations.length,
    afterCount: updatedTrip.reservations.length,
  };
}

export async function setActiveTrip(id: string, userId?: string): Promise<TravelTrip | null> {
  const trip = await getTrip(id, userId);
  if (!trip) {
    return null;
  }
  try {
    await kvStoreSet(ACTIVE_TRIP_ID_KEY, id, { userId });
  } catch {
    // Preserve UX by returning selected trip even when persistence fails.
  }
  return trip;
}

export async function getActiveTrip(userId?: string): Promise<TravelTrip | null> {
  const trips = await readTrips(userId);
  if (trips.length === 0) {
    return null;
  }
  let activeTripId: string | null = null;
  try {
    activeTripId = await kvStoreGet<string>(ACTIVE_TRIP_ID_KEY, { userId });
  } catch {
    activeTripId = null;
  }
  if (!activeTripId) {
    const firstTrip = trips[0];
    if (!firstTrip) {
      return null;
    }
    try {
      await kvStoreSet(ACTIVE_TRIP_ID_KEY, firstTrip.id, { userId });
    } catch {
      // Non-critical in degraded storage mode.
    }
    return firstTrip;
  }
  return trips.find((trip) => trip.id === activeTripId) ?? trips[0] ?? null;
}
