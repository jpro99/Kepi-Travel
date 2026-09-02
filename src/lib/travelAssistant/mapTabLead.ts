/**
 * Consumer Map tab lead: trip geography first, family location second.
 * G19 — never open Map on a family/style lab when the trip has stays or flights.
 */

export type MapTabLead = "trip" | "empty";

export function mapTabLeadMode(input: {
  stayCount: number;
  upcomingFlightCount: number;
}): MapTabLead {
  if (input.stayCount > 0 || input.upcomingFlightCount > 0) return "trip";
  return "empty";
}

/** Family live location is always a secondary link — never the primary Map CTA. */
export function showFamilyLocationAsPrimaryCta(): boolean {
  return false;
}

/** Airport indoor map on Map tab — M11 Plan {IATA} plus G18 next-departure. */
export function showMapTabAirportCta(input: {
  atAirport: boolean;
  plannableAirport: string | null | undefined;
}): boolean {
  if (input.atAirport) return true;
  return Boolean(input.plannableAirport?.trim());
}

/** Consumer live-map hides Dark / Sat+ style lab; streets is the default. */
export function hideLiveMapStyleLab(): boolean {
  return true;
}

export function liveMapViewLabel(
  view: "airport" | "family",
  airportPreviewMode: boolean,
): string {
  if (view === "airport") return airportPreviewMode ? "Plan airport" : "Airport";
  return "Family";
}

export function findPlannableAirportIata(
  flights: Array<{
    type?: string;
    flightDepartureAirport?: string;
    flightDate?: string;
    flightDepartureTime?: string;
    localTime?: string;
  }>,
  nowMs = Date.now(),
  physicalAirportIata?: string | null,
): string | null {
  const campus = physicalAirportIata?.trim().toUpperCase();
  if (campus) return campus;

  const gracePeriodStart = nowMs - 86_400_000;
  const candidates = flights
    .filter((reservation) => (reservation.type ?? "flight") === "flight")
    .map((reservation) => {
      const iata = reservation.flightDepartureAirport?.trim().toUpperCase();
      if (!iata) return null;
      const departureValue =
        reservation.flightDate ?? reservation.flightDepartureTime ?? reservation.localTime ?? "";
      const departureAt = Date.parse(departureValue);
      return { iata, departureAt };
    })
    .filter(
      (entry): entry is { iata: string; departureAt: number } =>
        entry != null &&
        (Number.isNaN(entry.departureAt) || entry.departureAt >= gracePeriodStart),
    );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (Number.isNaN(a.departureAt)) return 1;
    if (Number.isNaN(b.departureAt)) return -1;
    return a.departureAt - b.departureAt;
  });
  return candidates[0].iata;
}
