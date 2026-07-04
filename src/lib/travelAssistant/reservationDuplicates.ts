import {
  isSameFlightLeg,
  type FlightLegMatchFields,
} from "@/lib/travelAssistant/flightItinerarySync";

export interface DuplicateReservationFields extends FlightLegMatchFields {
  type: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
}

function normalizeDuplicateValue(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * True when draft is already represented on the trip.
 * Multi-leg tickets share one PNR — flights must match by leg (route / flight # / date), not code alone.
 */
export function isDuplicateReservation(
  reservation: DuplicateReservationFields,
  draft: DuplicateReservationFields,
): boolean {
  const reservationType = normalizeDuplicateValue(reservation.type);
  const draftType = normalizeDuplicateValue(draft.type);

  if (reservationType === "flight" && draftType === "flight") {
    return isSameFlightLeg(reservation, draft);
  }

  const reservationCode = normalizeDuplicateValue(reservation.confirmationCode ?? "");
  const draftCode = normalizeDuplicateValue(draft.confirmationCode ?? "");

  if (reservationType === "hotel" && draftType === "hotel") {
    const reservationDate = normalizeDuplicateValue(reservation.localTime).slice(0, 10);
    const draftDate = normalizeDuplicateValue(draft.localTime).slice(0, 10);
    const reservationLocation = normalizeDuplicateValue(reservation.location);
    const draftLocation = normalizeDuplicateValue(draft.location);
    if (
      reservationDate.length === 10 &&
      draftDate.length === 10 &&
      reservationDate === draftDate &&
      reservationLocation.length > 0 &&
      draftLocation.length > 0 &&
      reservationLocation === draftLocation
    ) {
      return true;
    }
    if (
      reservationCode.length > 0 &&
      draftCode.length > 0 &&
      reservationCode === draftCode &&
      reservationDate === draftDate
    ) {
      return true;
    }
    return false;
  }

  if (reservationCode.length > 0 && draftCode.length > 0 && reservationCode === draftCode) {
    if (reservationType === draftType) {
      return (
        normalizeDuplicateValue(reservation.localTime) === normalizeDuplicateValue(draft.localTime)
      );
    }
  }

  return (
    reservationType === draftType &&
    normalizeDuplicateValue(reservation.provider) === normalizeDuplicateValue(draft.provider) &&
    normalizeDuplicateValue(reservation.localTime) === normalizeDuplicateValue(draft.localTime) &&
    normalizeDuplicateValue(reservation.location) === normalizeDuplicateValue(draft.location)
  );
}
