import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const STAY_INTENT_KEY = "hotel-stay-intent";

export type StoredStayIntent = "needs_hotel" | "skip";

export interface SegmentStayDecision {
  segmentId: string;
  intent: StoredStayIntent;
  decidedAt: string;
  source: "user" | "auto";
  city?: string;
}

export interface TravelStayStyle {
  /** User often skips hub connections — auto-classify same-day stops. */
  usuallySkipsConnections: boolean;
  connectionSkipsCount: number;
  connectionNeedsHotelCount: number;
}

export interface TripHotelStayIntent {
  userId: string;
  tripId: string;
  updatedAt: string;
  decisions: Record<string, SegmentStayDecision>;
  travelStyle: TravelStayStyle;
}

function emptyTravelStyle(): TravelStayStyle {
  return {
    usuallySkipsConnections: false,
    connectionSkipsCount: 0,
    connectionNeedsHotelCount: 0,
  };
}

export function createEmptyTripStayIntent(userId: string, tripId: string): TripHotelStayIntent {
  return {
    userId,
    tripId,
    updatedAt: new Date().toISOString(),
    decisions: {},
    travelStyle: emptyTravelStyle(),
  };
}

function storageKey(tripId: string): string {
  return `${STAY_INTENT_KEY}:${tripId.trim()}`;
}

export async function getTripHotelStayIntent(
  userId: string,
  tripId: string,
): Promise<TripHotelStayIntent> {
  const namespace = userId.trim() || "anonymous";
  const trip = tripId.trim();
  if (!trip) return createEmptyTripStayIntent(namespace, trip);

  try {
    const existing = await Promise.race([
      kvStoreGet<TripHotelStayIntent>(storageKey(trip), { userId: namespace }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    if (existing?.tripId) return existing;
  } catch {
    /* degrade */
  }
  return createEmptyTripStayIntent(namespace, trip);
}

export async function recordSegmentStayDecision(input: {
  userId: string;
  tripId: string;
  segmentId: string;
  intent: StoredStayIntent;
  city?: string;
  stopKind?: string;
}): Promise<TripHotelStayIntent> {
  const existing = await getTripHotelStayIntent(input.userId, input.tripId);
  const decisions = { ...existing.decisions };
  decisions[input.segmentId] = {
    segmentId: input.segmentId,
    intent: input.intent,
    decidedAt: new Date().toISOString(),
    source: "user",
    city: input.city,
  };

  const travelStyle = { ...existing.travelStyle };
  const isConnectionLike = input.stopKind === "connection" || input.stopKind === "overnight_layover";
  if (isConnectionLike && input.intent === "skip") {
    travelStyle.connectionSkipsCount += 1;
    if (travelStyle.connectionSkipsCount >= 2) {
      travelStyle.usuallySkipsConnections = true;
    }
  }
  if (isConnectionLike && input.intent === "needs_hotel") {
    travelStyle.connectionNeedsHotelCount += 1;
    if (travelStyle.connectionNeedsHotelCount >= 2) {
      travelStyle.usuallySkipsConnections = false;
    }
  }

  const updated: TripHotelStayIntent = {
    ...existing,
    userId: input.userId,
    tripId: input.tripId,
    updatedAt: new Date().toISOString(),
    decisions,
    travelStyle,
  };

  await kvStoreSet(storageKey(input.tripId), updated, { userId: input.userId });
  return updated;
}

/** Flat map for deriveTripStaySegments. */
export function stayDecisionsMap(
  record: TripHotelStayIntent,
): Record<string, StoredStayIntent> {
  const map: Record<string, StoredStayIntent> = {};
  for (const [id, decision] of Object.entries(record.decisions)) {
    map[id] = decision.intent;
  }
  return map;
}
