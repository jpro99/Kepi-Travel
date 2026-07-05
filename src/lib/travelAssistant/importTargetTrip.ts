import {
  inferImportedTripMeta,
  type ImportTripReservationMeta,
} from "@/lib/travelAssistant/persistImportToTrip";
import {
  isTripShellConfigured,
  reservationPrimaryDate,
  reservationWithinTripWindow,
} from "@/lib/travelAssistant/tripWindow";

export interface ImportTargetTripRow {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  reservations?: Array<{ type?: string }>;
}

export type ImportTargetTripReason = "no-match" | "multiple-match" | "active-mismatch";

export type ResolveImportTargetTripResult =
  | { kind: "certain"; tripId: string }
  | {
      kind: "choose";
      candidates: ImportTargetTripRow[];
      inferredMeta: ReturnType<typeof inferImportedTripMeta>;
      reason: ImportTargetTripReason;
    }
  | { kind: "create"; inferredMeta: ReturnType<typeof inferImportedTripMeta> };

function countDraftDatesInTripWindow(draftDates: string[], trip: Pick<ImportTargetTripRow, "startDate" | "endDate">): number {
  return draftDates.filter((day) => reservationWithinTripWindow(day, trip.startDate, trip.endDate)).length;
}

export function draftDatesFromReservations(
  reservations: Array<{
    type?: string;
    localTime?: string;
    flightDate?: string;
    flightDepartureTime?: string;
    checkOutDate?: string;
  }>,
): string[] {
  return reservations
    .map((reservation) =>
      reservationPrimaryDate({
        type: reservation.type,
        localTime: reservation.localTime,
        flightDate: reservation.flightDate,
        flightDepartureTime: reservation.flightDepartureTime,
        checkOutDate: reservation.checkOutDate,
      }),
    )
    .filter((day) => day.length > 0);
}

export function resolveImportTargetTrip(args: {
  trips: ImportTargetTripRow[];
  draftDates: string[];
  activeTripId: string | null;
  reservations: ImportTripReservationMeta[];
}): ResolveImportTargetTripResult {
  const { trips, draftDates, activeTripId, reservations } = args;
  const inferredMeta = inferImportedTripMeta(reservations);

  if (trips.length === 0) {
    return { kind: "create", inferredMeta };
  }

  if (draftDates.length === 0) {
    if (trips.length === 1) {
      return { kind: "certain", tripId: trips[0]!.id };
    }
    return { kind: "choose", candidates: trips, inferredMeta, reason: "no-match" };
  }

  const configuredTrips = trips.filter((trip) => isTripShellConfigured(trip));
  const ranked = configuredTrips
    .map((trip) => ({ trip, matchCount: countDraftDatesInTripWindow(draftDates, trip) }))
    .filter((entry) => entry.matchCount > 0)
    .sort((left, right) => right.matchCount - left.matchCount);

  if (ranked.length === 0) {
    return { kind: "choose", candidates: trips, inferredMeta, reason: "no-match" };
  }

  const topScore = ranked[0]!.matchCount;
  const topTied = ranked.filter((entry) => entry.matchCount === topScore);
  const coversAllDates = topScore === draftDates.length;

  if (topTied.length === 1 && coversAllDates) {
    return { kind: "certain", tripId: topTied[0]!.trip.id };
  }

  if (topTied.length > 1) {
    return {
      kind: "choose",
      candidates: topTied.map((entry) => entry.trip),
      inferredMeta,
      reason: "multiple-match",
    };
  }

  const bestTrip = topTied[0]!.trip;
  const activeTrip = trips.find((trip) => trip.id === activeTripId) ?? null;
  const activeMatches =
    activeTrip != null &&
    draftDates.some((day) => reservationWithinTripWindow(day, activeTrip.startDate, activeTrip.endDate));

  if (!activeMatches && activeTripId && activeTripId !== bestTrip.id) {
    const candidates = [bestTrip];
    if (activeTrip && !candidates.some((trip) => trip.id === activeTrip.id)) {
      candidates.push(activeTrip);
    }
    for (const trip of trips) {
      if (!candidates.some((candidate) => candidate.id === trip.id)) {
        candidates.push(trip);
      }
    }
    return { kind: "choose", candidates, inferredMeta, reason: "active-mismatch" };
  }

  return { kind: "certain", tripId: bestTrip.id };
}
