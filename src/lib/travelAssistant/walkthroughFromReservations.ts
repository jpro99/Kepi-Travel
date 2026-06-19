import type { AlignmentLeg } from "@/lib/decision/tripAlignment";
import {
  extractBookUrlFromNotes,
  isPlannedReservation,
  parseAirportsFromLocation,
  reservationFlightDate,
} from "@/lib/travelAssistant/plannedReservationMatch";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";

export function buildWalkthroughLegsFromReservations(
  reservations: SessionReservation[],
): AlignmentLeg[] {
  const legs: AlignmentLeg[] = [];
  let step = 1;

  for (const reservation of reservations) {
    if (!isPlannedReservation(reservation)) continue;
    if (reservation.type === "train") continue;

    const route = parseAirportsFromLocation(reservation.location);
    const bookUrl = reservation.bookUrl ?? extractBookUrlFromNotes(reservation.notes);

    if (reservation.type === "flight") {
      legs.push({
        id: reservation.id,
        step: step++,
        role: "outbound",
        label: reservation.title,
        detail: reservation.notes.split(" · ")[0] ?? "Book this flight on the airline",
        status: "modeled",
        statusLabel: "Not booked yet — forward confirmation after purchase",
        priceUsd: reservation.quotedPriceUsd,
        originIata: reservation.flightDepartureAirport ?? route.dep,
        destinationIata: reservation.flightArrivalAirport ?? route.arr,
        departureDate: reservationFlightDate(reservation),
        airline: reservation.flightAirline ?? reservation.provider,
        bookUrl,
        bookLabel: bookUrl ? "Book this leg ↗" : undefined,
      });
      continue;
    }

    if (reservation.type === "hotel") {
      legs.push({
        id: reservation.id,
        step: step++,
        role: "hotel",
        label: reservation.title || reservation.provider,
        detail: reservation.notes.split(" · ")[0] ?? "Book your stay, then forward confirmation",
        status: "modeled",
        statusLabel: "Planned stay — not booked yet",
        priceUsd: reservation.quotedPriceUsd,
        departureDate: reservation.localTime.trim().slice(0, 10),
        bookUrl,
        bookLabel: bookUrl ? "Book hotel ↗" : undefined,
      });
    }
  }

  return legs;
}
