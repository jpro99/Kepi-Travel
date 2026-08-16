import {
  isSameFlightLeg,
  type FlightLegMatchFields,
} from "@/lib/travelAssistant/flightItinerarySync";

export interface DuplicateReservationFields extends FlightLegMatchFields {
  type: string;
  title?: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  departureAirport?: string;
  arrivalAirport?: string;
}

function normalizeDuplicateValue(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hasFullCompositeSignal(
  reservationType: string,
  draftType: string,
  reservationProvider: string,
  draftProvider: string,
  reservationLocalTime: string,
  draftLocalTime: string,
  reservationLocation: string,
  draftLocation: string,
): boolean {
  return (
    reservationType.length > 0 &&
    draftType.length > 0 &&
    reservationProvider.length > 0 &&
    draftProvider.length > 0 &&
    reservationLocalTime.length > 0 &&
    draftLocalTime.length > 0 &&
    reservationLocation.length > 0 &&
    draftLocation.length > 0
  );
}

/**
 * True when draft is already represented on the trip.
 * Multi-leg tickets share one PNR — flights must match by leg (route / flight # / date), not code alone.
 * Empty composite fields must never match (ENGINEERING_NOTES Problem 6).
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

  if (reservationCode.length > 0 && draftCode.length > 0 && reservationCode === draftCode) {
    return true;
  }

  if (reservationType !== draftType) {
    return false;
  }

  const reservationLocalTime = normalizeDuplicateValue(reservation.localTime);
  const draftLocalTime = normalizeDuplicateValue(draft.localTime);

  if (reservationType === "hotel" && draftType === "hotel") {
    const reservationDate = reservationLocalTime.slice(0, 10);
    const draftDate = draftLocalTime.slice(0, 10);
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
      return reservationLocalTime === draftLocalTime;
    }
  }

  const reservationProvider = normalizeDuplicateValue(reservation.provider);
  const draftProvider = normalizeDuplicateValue(draft.provider);
  const reservationLocation = normalizeDuplicateValue(reservation.location);
  const draftLocation = normalizeDuplicateValue(draft.location);

  if (
    !hasFullCompositeSignal(
      reservationType,
      draftType,
      reservationProvider,
      draftProvider,
      reservationLocalTime,
      draftLocalTime,
      reservationLocation,
      draftLocation,
    )
  ) {
    return false;
  }

  return (
    reservationProvider === draftProvider &&
    reservationLocalTime === draftLocalTime &&
    reservationLocation === draftLocation
  );
}
