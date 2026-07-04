export interface DuplicateReservationFields {
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

export function isDuplicateReservation(
  reservation: DuplicateReservationFields,
  draft: DuplicateReservationFields,
): boolean {
  const reservationCode = normalizeDuplicateValue(reservation.confirmationCode ?? "");
  const draftCode = normalizeDuplicateValue(draft.confirmationCode ?? "");
  if (reservationCode.length > 0 && draftCode.length > 0 && reservationCode === draftCode) {
    return true;
  }

  const reservationFlight = normalizeDuplicateValue(reservation.flightNumber ?? "");
  const draftFlight = normalizeDuplicateValue(draft.flightNumber ?? "");
  const reservationDep = normalizeDuplicateValue(reservation.flightDepartureAirport ?? "");
  const draftDep = normalizeDuplicateValue(draft.flightDepartureAirport ?? "");
  const reservationArr = normalizeDuplicateValue(reservation.flightArrivalAirport ?? "");
  const draftArr = normalizeDuplicateValue(draft.flightArrivalAirport ?? "");
  if (
    reservationFlight.length > 0 &&
    draftFlight.length > 0 &&
    reservationFlight === draftFlight &&
    reservationDep.length > 0 &&
    draftDep.length > 0 &&
    reservationDep === draftDep &&
    reservationArr.length > 0 &&
    draftArr.length > 0 &&
    reservationArr === draftArr
  ) {
    return true;
  }

  return (
    normalizeDuplicateValue(reservation.type) === normalizeDuplicateValue(draft.type) &&
    normalizeDuplicateValue(reservation.provider) === normalizeDuplicateValue(draft.provider) &&
    normalizeDuplicateValue(reservation.localTime) === normalizeDuplicateValue(draft.localTime) &&
    normalizeDuplicateValue(reservation.location) === normalizeDuplicateValue(draft.location)
  );
}
