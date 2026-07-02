import { dedupeFlights, flightDedupeKey } from "@/lib/travelAssistant/buildTripLegs";

/** Reservation shape used across consumer Home / Plan / Book shells. */
export type ConsumerReservationLike = {
  id: string;
  type: string;
  flightNumber?: string;
  flightDepartureTime?: string;
  localTime: string;
};

/**
 * Remove duplicate flight rows (same flightNumber + departure time) while
 * preserving chronological order and all non-flight reservations.
 */
export function dedupeConsumerReservations<T extends ConsumerReservationLike>(reservations: T[]): T[] {
  const flights = reservations.filter((reservation) => reservation.type === "flight");
  if (flights.length === 0) return reservations;

  const keptFlightKeys = new Set(dedupeFlights(flights).map((flight) => flightDedupeKey(flight)));
  const out: T[] = [];

  for (const reservation of reservations) {
    if (reservation.type !== "flight") {
      out.push(reservation);
      continue;
    }
    const key = flightDedupeKey(reservation);
    if (!keptFlightKeys.has(key)) continue;
    keptFlightKeys.delete(key);
    out.push(reservation);
  }

  return out;
}
