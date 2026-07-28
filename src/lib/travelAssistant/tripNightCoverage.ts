/**
 * Night-by-night sleep coverage for a trip (I34).
 * Hotels = where you sleep. Never treat a partial hotel span as covering every night
 * between two flights. Home-base nights before first outbound are not hotel gaps.
 */

export type NightStatus = "covered" | "skipped" | "gap" | "airborne" | "home";

export interface NightCoverageReservation {
  id: string;
  type: string;
  localTime?: string;
  timezone?: string;
  plannedOnly?: boolean;
  flightDate?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  checkOutDate?: string;
  checkoutDate?: string;
  checkout_date?: string;
  check_out_date?: string;
  checkOut?: string;
  endDate?: string;
  notes?: string;
  location?: string;
  title?: string;
  hotelSearchCity?: string;
}

export interface UncoveredNightRange {
  startNight: string;
  endNight: string;
  nightCount: number;
  suggestedCity: string;
}

export interface TripNightCoverage {
  windowStart: string | null;
  windowEnd: string | null;
  nights: Array<{ dateKey: string; status: NightStatus }>;
  uncoveredRanges: UncoveredNightRange[];
  hotelNightsInWindow: number;
  hotelNightsCovered: number;
  hotelNightsSkippedOrHome: number;
  hotelNightsGap: number;
}

export type CompletenessTone = "gray" | "orange" | "green";

export interface TripCompleteness {
  flights: CompletenessTone;
  hotels: CompletenessTone;
  overall: CompletenessTone;
  flightsLabel: string;
  hotelsLabel: string;
  summary: string;
  firstHotelGap: UncoveredNightRange | null;
  bookedFlightCount: number;
}

function dateOnly(value?: string | null): string {
  return (value ?? "").trim().slice(0, 10);
}

export function addIsoDays(dateKey: string, days: number): string {
  const ms = Date.parse(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(ms)) return dateKey;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

export function nightsBetweenInclusive(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T12:00:00Z`);
  const to = Date.parse(`${toKey}T12:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

export function preDepartureStayDecisionId(flightDay: string): string {
  return `pre-departure-${flightDay}`;
}

export function nightStayDecisionId(nightKey: string): string {
  return `night-${nightKey}`;
}

export function homeBaseStayDecisionId(iata: string): string {
  return `home-base-${iata.trim().toUpperCase()}`;
}

function hotelCheckoutDay(hotel: NightCoverageReservation): string {
  return (
    dateOnly(hotel.checkOutDate) ||
    dateOnly(hotel.checkoutDate) ||
    dateOnly(hotel.checkout_date) ||
    dateOnly(hotel.check_out_date) ||
    dateOnly(hotel.checkOut) ||
    dateOnly(hotel.endDate) ||
    ""
  );
}

function hotelCheckInDay(hotel: NightCoverageReservation): string {
  return dateOnly(hotel.localTime);
}

/** Hotel covers sleep night N when check-in ≤ N < check-out. */
export function hotelCoversNight(hotel: NightCoverageReservation, nightKey: string): boolean {
  const checkIn = hotelCheckInDay(hotel);
  const checkOut = hotelCheckoutDay(hotel);
  if (!checkIn || !checkOut) return false;
  return checkIn <= nightKey && checkOut > nightKey;
}

function flightDepDay(flight: NightCoverageReservation): string {
  return dateOnly(flight.flightDate) || dateOnly(flight.flightDepartureTime) || dateOnly(flight.localTime);
}

function flightArrDay(flight: NightCoverageReservation): string {
  return dateOnly(flight.flightArrivalTime) || flightDepDay(flight);
}

function isBookedFlight(r: NightCoverageReservation): boolean {
  return (r.type ?? "").toLowerCase() === "flight" && !r.plannedOnly;
}

function isBookedHotel(r: NightCoverageReservation): boolean {
  return (r.type ?? "").toLowerCase() === "hotel" && !r.plannedOnly;
}

/** Overnight flight occupies sleep nights from dep day through day before arrival. */
export function flightCoversNightAsAirborne(flight: NightCoverageReservation, nightKey: string): boolean {
  const dep = flightDepDay(flight);
  const arr = flightArrDay(flight);
  if (!dep || !arr || arr <= dep) return false;
  return dep <= nightKey && nightKey < arr;
}

function enumerateNights(start: string, endInclusive: string): string[] {
  if (!start || !endInclusive || endInclusive < start) return [];
  const out: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= endInclusive && guard < 400) {
    out.push(cursor);
    cursor = addIsoDays(cursor, 1);
    guard += 1;
  }
  return out;
}

function groupGapNights(
  gapNights: string[],
  hotels: NightCoverageReservation[],
): UncoveredNightRange[] {
  if (gapNights.length === 0) return [];
  const ranges: UncoveredNightRange[] = [];
  let start = gapNights[0]!;
  let prev = gapNights[0]!;
  for (let i = 1; i < gapNights.length; i += 1) {
    const night = gapNights[i]!;
    if (night === addIsoDays(prev, 1)) {
      prev = night;
      continue;
    }
    ranges.push(makeRange(start, prev, hotels));
    start = night;
    prev = night;
  }
  ranges.push(makeRange(start, prev, hotels));
  return ranges;
}

function makeRange(
  startNight: string,
  endNight: string,
  hotels: NightCoverageReservation[],
): UncoveredNightRange {
  const before = [...hotels]
    .filter((h) => hotelCheckoutDay(h) && hotelCheckoutDay(h) <= startNight)
    .sort((a, b) => hotelCheckoutDay(b).localeCompare(hotelCheckoutDay(a)))[0];
  const after = [...hotels]
    .filter((h) => hotelCheckInDay(h) && hotelCheckInDay(h) >= endNight)
    .sort((a, b) => hotelCheckInDay(a).localeCompare(hotelCheckInDay(b)))[0];
  const suggestedCity =
    before?.hotelSearchCity?.trim() ||
    after?.hotelSearchCity?.trim() ||
    before?.location?.trim() ||
    after?.location?.trim() ||
    "your next city";
  return {
    startNight,
    endNight,
    nightCount: nightsBetweenInclusive(startNight, endNight),
    suggestedCity,
  };
}

export interface BuildTripNightCoverageInput {
  reservations: NightCoverageReservation[];
  stayDecisions?: Record<string, "needs_hotel" | "skip">;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  nowMs?: number;
}

/**
 * Sleep nights from first destination arrival through last night before final return
 * (or trip end − 1). Home nights before first outbound are not in the gap window.
 */
export function buildTripNightCoverage(input: BuildTripNightCoverageInput): TripNightCoverage {
  const nowMs = input.nowMs ?? Date.now();
  const todayKey = new Date(nowMs).toISOString().slice(0, 10);
  const flights = input.reservations
    .filter(isBookedFlight)
    .slice()
    .sort((a, b) => flightDepDay(a).localeCompare(flightDepDay(b)));
  const hotels = input.reservations.filter(isBookedHotel);
  const decisions = input.stayDecisions ?? {};

  const firstFlight = flights[0] ?? null;
  const originIata = (firstFlight?.flightDepartureAirport ?? "").trim().toUpperCase();
  const homeBaseSkipped =
    Boolean(originIata && decisions[homeBaseStayDecisionId(originIata)] === "skip") ||
    (firstFlight
      ? decisions[preDepartureStayDecisionId(flightDepDay(firstFlight))] === "skip"
      : false);

  // Destination sleep window: first arrival away from origin → night before trip end
  // (or night before final return departure when trip end is missing).
  let windowStart = "";
  for (const f of flights) {
    const arr = (f.flightArrivalAirport ?? "").trim().toUpperCase();
    if (arr && arr !== originIata) {
      windowStart = flightArrDay(f);
      break;
    }
  }
  if (!windowStart) {
    windowStart =
      (hotels
        .map(hotelCheckInDay)
        .filter(Boolean)
        .sort()[0] ?? "") ||
      (flights[0] ? flightArrDay(flights[0]) : "") ||
      dateOnly(input.tripStartDate);
  }

  const lastFlight = flights[flights.length - 1] ?? null;
  let windowEnd = "";
  if (dateOnly(input.tripEndDate)) {
    windowEnd = addIsoDays(dateOnly(input.tripEndDate), -1);
  } else if (lastFlight) {
    windowEnd = addIsoDays(flightDepDay(lastFlight), -1);
  } else if (hotels.length) {
    const lastCheckout = hotels.map(hotelCheckoutDay).filter(Boolean).sort().at(-1) ?? "";
    windowEnd = lastCheckout ? addIsoDays(lastCheckout, -1) : "";
  }

  if (!windowStart || !windowEnd || windowEnd < windowStart) {
    return {
      windowStart: windowStart || null,
      windowEnd: windowEnd || null,
      nights: [],
      uncoveredRanges: [],
      hotelNightsInWindow: 0,
      hotelNightsCovered: 0,
      hotelNightsSkippedOrHome: 0,
      hotelNightsGap: 0,
    };
  }

  // Don't flag past nights as open gaps for planning (still count coverage for completeness).
  const nights = enumerateNights(windowStart, windowEnd).map((dateKey) => {
    if (flights.some((f) => flightCoversNightAsAirborne(f, dateKey))) {
      return { dateKey, status: "airborne" as const };
    }
    if (hotels.some((h) => hotelCoversNight(h, dateKey))) {
      return { dateKey, status: "covered" as const };
    }
    if (decisions[nightStayDecisionId(dateKey)] === "skip") {
      return { dateKey, status: "skipped" as const };
    }
    // Home-base: nights before first outbound at origin (shouldn't be in window, but guard).
    if (
      homeBaseSkipped &&
      firstFlight &&
      dateKey < flightDepDay(firstFlight) &&
      dateKey >= addIsoDays(flightDepDay(firstFlight), -2)
    ) {
      return { dateKey, status: "home" as const };
    }
    return { dateKey, status: "gap" as const };
  });

  const actionableGaps = nights
    .filter((n) => n.status === "gap" && n.dateKey >= todayKey)
    .map((n) => n.dateKey);

  const uncoveredRanges = groupGapNights(actionableGaps, hotels);
  const inWindow = nights.filter((n) => n.status !== "airborne");
  const hotelNightsCovered = inWindow.filter((n) => n.status === "covered").length;
  const hotelNightsSkippedOrHome = inWindow.filter(
    (n) => n.status === "skipped" || n.status === "home",
  ).length;
  const hotelNightsGap = inWindow.filter((n) => n.status === "gap").length;

  return {
    windowStart,
    windowEnd,
    nights,
    uncoveredRanges,
    hotelNightsInWindow: inWindow.length,
    hotelNightsCovered,
    hotelNightsSkippedOrHome,
    hotelNightsGap,
  };
}

/** True when night-before-flight should not nag (home base, skip, or airborne). */
export function shouldSkipPreDepartureHotelNag(input: {
  flightDay: string;
  nightBeforeKey: string;
  flightDepartureAirport?: string;
  firstOutboundAirport?: string;
  firstOutboundFlightDay?: string;
  stayDecisions?: Record<string, "needs_hotel" | "skip">;
  reservations: NightCoverageReservation[];
}): boolean {
  const decisions = input.stayDecisions ?? {};
  const iata = (input.flightDepartureAirport ?? "").trim().toUpperCase();
  const origin = (input.firstOutboundAirport ?? "").trim().toUpperCase();

  if (decisions[preDepartureStayDecisionId(input.flightDay)] === "skip") return true;
  if (decisions[nightStayDecisionId(input.nightBeforeKey)] === "skip") return true;
  if (iata && decisions[homeBaseStayDecisionId(iata)] === "skip") return true;

  // Smart default: never demand a hotel the night before the trip's first outbound.
  if (
    input.firstOutboundFlightDay &&
    input.flightDay === input.firstOutboundFlightDay &&
    iata &&
    iata === origin
  ) {
    return true;
  }

  // Same origin airport within 36h of first outbound — still home-base.
  if (iata && iata === origin && input.firstOutboundFlightDay) {
    const firstMs = Date.parse(`${input.firstOutboundFlightDay}T12:00:00Z`);
    const flightMs = Date.parse(`${input.flightDay}T12:00:00Z`);
    if (!Number.isNaN(firstMs) && !Number.isNaN(flightMs) && flightMs - firstMs <= 2 * 86_400_000) {
      return true;
    }
  }

  if (input.reservations.some((r) => isBookedFlight(r) && flightCoversNightAsAirborne(r, input.nightBeforeKey))) {
    return true;
  }

  return false;
}

export function buildTripCompleteness(input: {
  reservations: NightCoverageReservation[];
  stayDecisions?: Record<string, "needs_hotel" | "skip">;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  nowMs?: number;
}): TripCompleteness {
  const flights = input.reservations.filter(isBookedFlight);
  const coverage = buildTripNightCoverage(input);
  const bookedFlightCount = flights.length;

  let flightsTone: CompletenessTone = "gray";
  let flightsLabel = "No flights yet";
  if (bookedFlightCount > 0) {
    flightsTone = "green";
    flightsLabel = `${bookedFlightCount} flight${bookedFlightCount === 1 ? "" : "s"} booked`;
  }

  let hotelsTone: CompletenessTone = "gray";
  let hotelsLabel = "No stay nights yet";
  if (coverage.hotelNightsInWindow > 0) {
    if (coverage.hotelNightsGap === 0) {
      hotelsTone = "green";
      hotelsLabel =
        coverage.hotelNightsSkippedOrHome > 0
          ? "Stays covered (incl. home nights)"
          : "Every night has a stay";
    } else {
      hotelsTone = "orange";
      const first = coverage.uncoveredRanges[0];
      hotelsLabel = first
        ? `${coverage.hotelNightsGap} night${coverage.hotelNightsGap === 1 ? "" : "s"} need a stay · ${first.startNight.slice(5)}–${first.endNight.slice(5)}`
        : `${coverage.hotelNightsGap} nights need a stay`;
    }
  } else if (bookedFlightCount > 0) {
    hotelsTone = "orange";
    hotelsLabel = "Add hotels for destination nights";
  }

  const overall: CompletenessTone =
    flightsTone === "gray" && hotelsTone === "gray"
      ? "gray"
      : flightsTone === "green" && hotelsTone === "green"
        ? "green"
        : "orange";

  const summary =
    overall === "green"
      ? "Trip is set — flights and stays are covered."
      : overall === "orange"
        ? "Trip in progress — finish the orange sections."
        : "Add flights and stays to light this up.";

  return {
    flights: flightsTone,
    hotels: hotelsTone,
    overall,
    flightsLabel,
    hotelsLabel,
    summary,
    firstHotelGap: coverage.uncoveredRanges[0] ?? null,
    bookedFlightCount,
  };
}
