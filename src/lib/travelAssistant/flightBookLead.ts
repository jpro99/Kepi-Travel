/**
 * Book → Flights lead: upcoming tickets first, search only when none are booked.
 * G18 — never open with a search lab when the traveler already has flights.
 */

export type FlightBookLead = "itinerary" | "empty";

export function flightBookLeadMode(input: {
  upcomingFlightCount: number;
}): FlightBookLead {
  return input.upcomingFlightCount > 0 ? "itinerary" : "empty";
}

/** Top-of-tab search launcher — only when there are no upcoming flights. */
export function showFlightSearchLauncherAtTop(
  lead: FlightBookLead,
  searchActive: boolean,
): boolean {
  if (searchActive) return false;
  return lead === "empty";
}

/** Airport map on the next ticket — not gated to the 48h terminal promo. */
export function showNextFlightAirportMapCta(input: {
  hasNextFlight: boolean;
  departureIata: string | null | undefined;
}): boolean {
  return input.hasNextFlight && Boolean(input.departureIata?.trim());
}

/** Departure airport map on any upcoming flight card (not only the chronologically next leg). */
export function showFlightDepartureAirportMapCta(input: {
  isPast: boolean;
  departureIata: string | null | undefined;
}): boolean {
  return !input.isPast && Boolean(input.departureIata?.trim());
}

/** Arrival airport map when the leg lands at a different airport than it departs. */
export function showFlightArrivalAirportMapCta(input: {
  isPast: boolean;
  departureIata: string | null | undefined;
  arrivalIata: string | null | undefined;
}): boolean {
  const dep = input.departureIata?.trim().toUpperCase() ?? "";
  const arr = input.arrivalIata?.trim().toUpperCase() ?? "";
  return !input.isPast && Boolean(arr) && arr !== dep;
}

/**
 * One-shot live status for the next flight when the tab is open.
 * Stays inside F6: auto-check only within 24h of departure (and 1h after).
 */
export function shouldAutoCheckNextFlightStatus(input: {
  hasNextFlight: boolean;
  hasLiveStatus: boolean;
  hoursUntilDeparture: number;
}): boolean {
  if (!input.hasNextFlight || input.hasLiveStatus) return false;
  return input.hoursUntilDeparture > -1 && input.hoursUntilDeparture < 24;
}

/** Next upcoming ticket always renders live-status chrome (badge may be empty until checked). */
export function nextFlightShowsStatusChrome(input: {
  isNextFlight: boolean;
  isPast: boolean;
}): boolean {
  return input.isNextFlight && !input.isPast;
}
