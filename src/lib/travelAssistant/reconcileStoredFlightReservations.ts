import { prepareReviewDraftForAccept } from "@/lib/travelAssistant/prepareReviewDraftForAccept";

export interface StoredFlightReservation {
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  [key: string]: unknown;
}

function flightScheduleFingerprint(reservation: StoredFlightReservation): string {
  return [
    reservation.localTime,
    reservation.flightDate ?? "",
    reservation.flightDepartureTime ?? "",
    reservation.timezone ?? "",
  ].join("|");
}

/** Align stale flightDate / flightDepartureTime with trusted localTime on trip load. */
export function reconcileStoredFlightReservations<T extends StoredFlightReservation>(
  reservations: T[],
): { reservations: T[]; changed: boolean } {
  let changed = false;
  const next = reservations.map((reservation) => {
    if (reservation.type !== "flight") return reservation;
    const before = flightScheduleFingerprint(reservation);
    const reconciled = prepareReviewDraftForAccept({ ...reservation }) as T;
    if (flightScheduleFingerprint(reconciled) !== before) {
      changed = true;
      return reconciled;
    }
    return reservation;
  });
  return { reservations: next, changed };
}
