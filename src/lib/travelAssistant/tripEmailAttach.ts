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
  updateTrip,
  type TravelTrip,
} from "@/lib/travelAssistant/tripStore";

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

export async function resolveTargetTripForEmailForward(
  userId: string,
  tripId: string | undefined,
  drafts: EmailForwardDraft[],
): Promise<TravelTrip | null> {
  if (tripId) {
    return getTrip(tripId, userId);
  }

  const inferred = inferTripWindowFromDrafts(drafts);
  let trip = await getActiveTrip(userId);

  if (!trip) {
    const wizard: BookingWizardProgress = {
      ...advanceBookingWizard(EMPTY_BOOKING_WIZARD, "complete-setup"),
      phase: "flights",
    };
    return createTrip(
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
  }

  if (!isTripShellConfigured(trip) || trip.reservations.length === 0) {
    const patch = {
      name: isTripShellConfigured(trip) ? trip.name : inferred.name,
      destination: isPlaceholderDestination(trip.destination) ? inferred.destination : trip.destination,
      startDate: inferred.startDate,
      endDate: inferred.endDate,
      minutesToDeparture:
        computeMinutesToDeparture({
          startDate: inferred.startDate,
          reservations: [...trip.reservations, ...drafts],
        }) ?? trip.minutesToDeparture,
    };
    const updated = await updateTrip(trip.id, patch, userId);
    return updated ?? trip;
  }

  return trip;
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
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    assignedTo: existing.assignedTo.length > 0 ? existing.assignedTo : incoming.assignedTo,
    notes: [existing.notes, incoming.notes].filter(Boolean).join(" ").trim(),
    source: existing.source === "manual" ? existing.source : "imported",
  };
}
