import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import {
  advanceBookingWizard,
  EMPTY_BOOKING_WIZARD,
  type BookingWizardProgress,
} from "@/lib/travelAssistant/bookingWizard";
import {
  computeMinutesToDeparture,
  dateOnly,
  isTripShellConfigured,
  reservationPrimaryDate,
  reservationWithinTripWindow,
} from "@/lib/travelAssistant/tripWindow";
import {
  createTrip,
  getActiveTrip,
  getTrip,
  listTrips,
  setActiveTrip,
  updateTrip,
  type TravelTrip,
} from "@/lib/travelAssistant/tripStore";
import { mergeReservationPricingFields } from "@/lib/travelAssistant/reservationPricingMerge";

export type { ReservationPricingFields } from "@/lib/travelAssistant/reservationPricingMerge";
export { mergeReservationPricingFields } from "@/lib/travelAssistant/reservationPricingMerge";

export interface EmailForwardDraft {
  type?: string;
  title?: string;
  location?: string;
  localTime?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  checkOutDate?: string;
  arrivalAirport?: string;
  departureAirport?: string;
}

function isPlaceholderDestination(destination: string): boolean {
  const normalized = destination.trim().toLowerCase();
  return normalized.length === 0 || normalized === "set destination" || normalized === "destination pending";
}

function inferDestinationFromDrafts(drafts: EmailForwardDraft[]): string {
  for (const draft of drafts) {
    const location = draft.location?.trim() ?? "";
    if (location) {
      const arrow = location.match(/(?:->|→)\s*(.+)$/u);
      if (arrow?.[1]?.trim()) return arrow[1].trim();
      if (!location.includes("->") && !location.includes("→")) return location;
    }
    const arrival = draft.arrivalAirport?.trim();
    if (arrival) return arrival;
  }
  return "Set destination";
}

export function inferTripWindowFromDrafts(drafts: EmailForwardDraft[]): {
  startDate: string;
  endDate: string;
  destination: string;
  name: string;
} {
  const dates: string[] = [];
  for (const draft of drafts) {
    const day = reservationPrimaryDate(draft);
    if (day) dates.push(day);
    const checkout = dateOnly(draft.checkOutDate);
    if (checkout) dates.push(checkout);
  }
  dates.sort();
  const today = new Date().toISOString().slice(0, 10);
  const startDate = dates[0] ?? today;
  const endDate = dates[dates.length - 1] ?? startDate;
  const destination = inferDestinationFromDrafts(drafts);
  const label = destination === "Set destination" ? "Imported trip" : `Trip to ${destination.split(/[,/]/u)[0]?.trim() || destination}`;
  return { startDate, endDate, destination, name: label };
}

export function expandTripWindowIfNeeded(
  trip: Pick<TravelTrip, "startDate" | "endDate">,
  reservationDate: string,
): { startDate: string; endDate: string } | null {
  const day = dateOnly(reservationDate);
  if (!day) return null;
  if (reservationWithinTripWindow(day, trip.startDate, trip.endDate)) return null;
  const start = dateOnly(trip.startDate);
  const end = dateOnly(trip.endDate);
  return {
    startDate: day < start ? day : start,
    endDate: day > end ? day : end,
  };
}

export function countDraftDatesInTripWindow(
  draftDates: string[],
  trip: Pick<TravelTrip, "startDate" | "endDate">,
): number {
  return draftDates.filter((day) => reservationWithinTripWindow(day, trip.startDate, trip.endDate)).length;
}

export function pickBestMatchingTripForDrafts(
  trips: TravelTrip[],
  draftDates: string[],
  activeTripId?: string | null,
): TravelTrip | null {
  if (draftDates.length === 0) {
    return null;
  }

  const ranked = trips
    .filter((candidate) => isTripShellConfigured(candidate))
    .map((trip) => ({
      trip,
      matchCount: countDraftDatesInTripWindow(draftDates, trip),
    }))
    .filter((entry) => entry.matchCount > 0)
    .sort((left, right) => {
      if (right.matchCount !== left.matchCount) {
        return right.matchCount - left.matchCount;
      }
      const leftCoversAll = left.matchCount === draftDates.length ? 1 : 0;
      const rightCoversAll = right.matchCount === draftDates.length ? 1 : 0;
      if (rightCoversAll !== leftCoversAll) {
        return rightCoversAll - leftCoversAll;
      }
      if (activeTripId) {
        if (left.trip.id === activeTripId) return -1;
        if (right.trip.id === activeTripId) return 1;
      }
      return 0;
    });

  return ranked[0]?.trip ?? null;
}

async function activateTripIfNeeded(trip: TravelTrip, userId: string): Promise<TravelTrip> {
  const activeTrip = await getActiveTrip(userId);
  if (activeTrip?.id === trip.id) {
    return trip;
  }
  const activated = await setActiveTrip(trip.id, userId);
  return activated ?? trip;
}

async function reuseEmptyTripShell(
  emptyShell: TravelTrip,
  inferred: ReturnType<typeof inferTripWindowFromDrafts>,
  drafts: EmailForwardDraft[],
  userId: string,
): Promise<TravelTrip> {
  const updated = await updateTrip(
    emptyShell.id,
    {
      name: inferred.name,
      destination: inferred.destination,
      startDate: inferred.startDate,
      endDate: inferred.endDate,
      minutesToDeparture:
        computeMinutesToDeparture({
          startDate: inferred.startDate,
          reservations: drafts,
        }) ?? emptyShell.minutesToDeparture,
    },
    userId,
  );
  const nextTrip = updated ?? emptyShell;
  return activateTripIfNeeded(nextTrip, userId);
}

async function createTripFromEmailForward(
  inferred: ReturnType<typeof inferTripWindowFromDrafts>,
  drafts: EmailForwardDraft[],
  userId: string,
): Promise<TravelTrip> {
  const wizard: BookingWizardProgress = {
    ...advanceBookingWizard(EMPTY_BOOKING_WIZARD, "complete-setup"),
    phase: "flights",
  };
  const created = await createTrip(
    {
      name: inferred.name,
      destination: inferred.destination,
      startDate: inferred.startDate,
      endDate: inferred.endDate,
      minutesToDeparture:
        computeMinutesToDeparture({ startDate: inferred.startDate, reservations: drafts }) ?? 180,
      bookingWizard: wizard,
    },
    userId,
  );
  return activateTripIfNeeded(created, userId);
}

export async function resolveTargetTripForEmailForward(
  userId: string,
  tripId: string | undefined,
  drafts: EmailForwardDraft[],
): Promise<TravelTrip | null> {
  if (tripId) {
    return getTrip(tripId, userId);
  }

  const inferred = inferTripWindowFromDrafts(drafts);
  const draftDates = drafts.map((draft) => reservationPrimaryDate(draft)).filter(Boolean);
  const allTrips = await listTrips(userId);
  const activeTrip = await getActiveTrip(userId);
  const activeTripId = activeTrip?.id ?? null;

  const matchingTrip = pickBestMatchingTripForDrafts(allTrips, draftDates, activeTripId);
  if (matchingTrip) {
    return activateTripIfNeeded(matchingTrip, userId);
  }

  if (draftDates.length === 0 && activeTrip) {
    if (!isTripShellConfigured(activeTrip) || activeTrip.reservations.length === 0) {
      const patch = {
        name: isTripShellConfigured(activeTrip) ? activeTrip.name : inferred.name,
        destination: isPlaceholderDestination(activeTrip.destination)
          ? inferred.destination
          : activeTrip.destination,
        startDate: inferred.startDate,
        endDate: inferred.endDate,
        minutesToDeparture:
          computeMinutesToDeparture({
            startDate: inferred.startDate,
            reservations: [...activeTrip.reservations, ...drafts],
          }) ?? activeTrip.minutesToDeparture,
      };
      const updated = await updateTrip(activeTrip.id, patch, userId);
      return updated ?? activeTrip;
    }
    return activeTrip;
  }

  const emptyShell = allTrips.find(
    (candidate) => !isTripShellConfigured(candidate) && candidate.reservations.length === 0,
  );
  if (emptyShell) {
    return reuseEmptyTripShell(emptyShell, inferred, drafts, userId);
  }

  return createTripFromEmailForward(inferred, drafts, userId);
}

function normalizeFlightCompare(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/\s+/gu, "");
}

export function detectFlightScheduleChange(
  existing: SessionReservation,
  incoming: SessionReservation,
): string[] {
  if (existing.type !== "flight" || incoming.type !== "flight") return [];
  const changes: string[] = [];
  const existingDep = normalizeFlightCompare(existing.flightDepartureTime ?? existing.localTime);
  const incomingDep = normalizeFlightCompare(incoming.flightDepartureTime ?? incoming.localTime);
  if (existingDep && incomingDep && existingDep !== incomingDep) {
    changes.push("departure time");
  }
  const existingArr = normalizeFlightCompare(existing.flightArrivalTime);
  const incomingArr = normalizeFlightCompare(incoming.flightArrivalTime);
  if (existingArr && incomingArr && existingArr !== incomingArr) {
    changes.push("arrival time");
  }
  const existingFrom = normalizeFlightCompare(existing.flightDepartureAirport);
  const incomingFrom = normalizeFlightCompare(incoming.flightDepartureAirport);
  if (existingFrom && incomingFrom && existingFrom !== incomingFrom) {
    changes.push("departure airport");
  }
  const existingTo = normalizeFlightCompare(existing.flightArrivalAirport);
  const incomingTo = normalizeFlightCompare(incoming.flightArrivalAirport);
  if (existingTo && incomingTo && existingTo !== incomingTo) {
    changes.push("arrival airport");
  }
  const existingFlight = normalizeFlightCompare(existing.flightNumber);
  const incomingFlight = normalizeFlightCompare(incoming.flightNumber);
  if (existingFlight && incomingFlight && existingFlight !== incomingFlight) {
    changes.push("flight number");
  }
  return changes;
}

export function mergeFlightReservationUpdate(
  existing: SessionReservation,
  incoming: SessionReservation,
): SessionReservation {
  const merged: SessionReservation = {
    ...existing,
    ...incoming,
    id: existing.id,
    assignedTo: existing.assignedTo.length > 0 ? existing.assignedTo : incoming.assignedTo,
    notes: [existing.notes, incoming.notes].filter(Boolean).join(" ").trim(),
    source: existing.source === "manual" ? existing.source : "imported",
  };
  return mergeReservationPricingFields(merged, incoming) as SessionReservation;
}
