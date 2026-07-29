/**
 * Night-by-night sleep coverage for a trip (I34 / I35).
 * Hotels = where you sleep. Never treat a partial hotel span as covering every night
 * between two flights. Home-base nights before first outbound are not hotel gaps.
 * Callers should remap hotel years into the trip window before coverage (hotelTripDateRepair).
 */

import {
  hotelCoversSleepNight,
  remapHotelDatesIntoTripWindow,
} from "@/lib/travelAssistant/hotelTripDateRepair";
import {
  correctPastTravelIsoDate,
  correctReservationTravelDates,
} from "@/lib/travelAssistant/travelDateCorrection";
import {
  collectReservationDateKeys,
  MAX_TRIP_WINDOW_DAYS,
  reconcileTripWindowDates,
} from "@/lib/travelAssistant/tripWindowRepair";

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
  /** All gap nights in the window (includes past). */
  hotelNightsGap: number;
  /** Future gap nights only — use this for UI counts. */
  hotelNightsGapActionable: number;
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
  hotelGaps: UncoveredNightRange[];
  bookedFlightCount: number;
}

/** Human date for stay gaps — "Sep 15" / "Sep 15–17". */
export function formatStayRangeLabel(startNight: string, endNight: string): string {
  const fmt = (key: string): string => {
    const ms = Date.parse(`${key}T12:00:00Z`);
    if (Number.isNaN(ms)) return key.slice(5);
    return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  if (startNight === endNight) return fmt(startNight);
  return `${fmt(startNight)} – ${fmt(endNight)}`;
}

/**
 * Arrival calendar day for sleep / airborne math (I40).
 * Explicit `flightArrivalTime` wins. When arrival is blank (common on forwarded
 * long-hauls), do NOT fall back to departure day — that made SEA→FCO look like a
 * same-day landing and nagged Sep 1 for a Polignano hotel while airborne.
 * Connection hubs still use departure day for same-day onward matching.
 */
export function flightArrivalDayForSleep(
  flight: NightCoverageReservation,
  options?: { forConnectionMatch?: boolean },
): string {
  const explicit = dateOnly(flight.flightArrivalTime);
  if (explicit) return explicit;
  const dep = flightDepDay(flight);
  if (!dep) return "";
  // Blank arrival + looking for a same-day connection: use dep day so ONT→SEA→FCO still chains.
  if (options?.forConnectionMatch) return dep;
  // Terminal / overnight ESTIMATE: sleep / airborne starts the next calendar day.
  return addIsoDays(dep, 1);
}

/**
 * First night the traveler actually sleeps away from home.
 * Skips same-day connection hubs (ONT→SEA→FCO same day → start at FCO arrival).
 */
export function resolveFirstSleepNight(flights: NightCoverageReservation[]): string {
  const ordered = flights
    .filter(isBookedFlight)
    .slice()
    .sort((a, b) => flightDepDay(a).localeCompare(flightDepDay(b)));

  for (let i = 0; i < ordered.length; i += 1) {
    const flight = ordered[i]!;
    const arrAirport = (flight.flightArrivalAirport ?? "").trim().toUpperCase();
    if (!arrAirport) continue;

    const connectionDay = flightArrivalDayForSleep(flight, { forConnectionMatch: true });
    if (!connectionDay) continue;

    const sameDayOnward = ordered.slice(i + 1).some((next) => {
      const nextDep = (next.flightDepartureAirport ?? "").trim().toUpperCase();
      const nextDepDay = flightDepDay(next);
      return nextDep === arrAirport && nextDepDay === connectionDay;
    });
    if (sameDayOnward) continue;

    // First real destination arrival (explicit, or dep+1 when arrival time is blank).
    return flightArrivalDayForSleep(flight);
  }
  return ordered[0] ? flightArrivalDayForSleep(ordered[0]) : "";
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
  return hotelCoversSleepNight(
    {
      localTime: hotel.localTime,
      checkOutDate: hotelCheckoutDay(hotel) || hotel.checkOutDate,
      notes: hotel.notes,
    },
    nightKey,
  );
}

function flightDepDay(flight: NightCoverageReservation): string {
  return dateOnly(flight.flightDate) || dateOnly(flight.flightDepartureTime) || dateOnly(flight.localTime);
}

function flightArrDay(flight: NightCoverageReservation): string {
  // Display / legacy: prefer explicit arrival, else dep day.
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
  if (!dep) return false;
  const explicitArr = dateOnly(flight.flightArrivalTime);
  // Blank arrival on a non-connection leg → ESTIMATE overnight (I40).
  const arr = explicitArr || addIsoDays(dep, 1);
  if (!arr || arr <= dep) return false;
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
  const referenceDate = new Date(nowMs);
  // I37: never plan stay gaps against a stale 2025 trip window when we're in 2026.
  const tripBounds = reconcileTripWindowDates(
    input.tripStartDate,
    input.tripEndDate,
    collectReservationDateKeys(input.reservations),
    referenceDate,
  );
  const tripStart = tripBounds.startDate;
  const tripEnd = tripBounds.endDate;

  const flights = input.reservations
    .filter(isBookedFlight)
    .map((f) => correctReservationTravelDates(f, referenceDate))
    .slice()
    .sort((a, b) => flightDepDay(a).localeCompare(flightDepDay(b)));
  // Remap hotels into the repaired window even if persistence hasn't caught up yet.
  const hotels = input.reservations
    .filter(isBookedHotel)
    .map((h) => remapHotelDatesIntoTripWindow(h, tripStart, tripEnd));
  const decisions = input.stayDecisions ?? {};

  const firstFlight = flights[0] ?? null;
  const originIata = (firstFlight?.flightDepartureAirport ?? "").trim().toUpperCase();
  const homeBaseSkipped =
    Boolean(originIata && decisions[homeBaseStayDecisionId(originIata)] === "skip") ||
    (firstFlight
      ? decisions[preDepartureStayDecisionId(flightDepDay(firstFlight))] === "skip"
      : false);

  // Destination sleep window: first real sleep night abroad (skip connection hubs).
  // Never seed from hotel check-in when flights exist — that caused Sep 1 Polignano gaps
  // before the Sep 2 landing.
  let windowStart = resolveFirstSleepNight(flights);
  if (windowStart) {
    windowStart = correctPastTravelIsoDate(windowStart, referenceDate);
  }
  if (!windowStart && flights.length === 0) {
    windowStart =
      (hotels
        .map(hotelCheckInDay)
        .filter(Boolean)
        .sort()[0] ?? "") ||
      tripStart;
  } else if (!windowStart) {
    windowStart = tripStart;
  }

  const lastFlight = flights[flights.length - 1] ?? null;
  const lastHotelCheckout = hotels.map(hotelCheckoutDay).filter(Boolean).sort().at(-1) ?? "";
  const lastFlightDep = lastFlight
    ? correctPastTravelIsoDate(flightDepDay(lastFlight), referenceDate)
    : "";
  // Homebound cap (I40): only when the last flight departs *after* sleep window starts
  // (true return). Outbound-only trips must not clamp Europe stays to the day before SEA→FCO.
  const returnEndCap =
    lastFlightDep && windowStart && lastFlightDep > windowStart
      ? addIsoDays(lastFlightDep, -1)
      : "";

  // Prefer reservation facts (last return / last checkout) over a possibly expanded tripEnd.
  let windowEnd = "";
  if (returnEndCap) {
    windowEnd = returnEndCap;
  }
  if (lastHotelCheckout) {
    const hotelEnd = addIsoDays(lastHotelCheckout, -1);
    if (!windowEnd || hotelEnd > windowEnd) windowEnd = hotelEnd;
  }
  if (!windowEnd && tripEnd) {
    windowEnd = addIsoDays(tripEnd, -1);
  }

  // Trip end can extend a short ground stay, but never past the homebound return (I40)
  // and never into a months-long franken-window (I38).
  if (tripEnd && windowStart) {
    const tripWindowEnd = addIsoDays(tripEnd, -1);
    if (tripWindowEnd >= windowStart) {
      const anchored = windowEnd && windowEnd >= windowStart ? windowEnd : windowStart;
      const maxAllowed = addIsoDays(anchored, Math.min(14, MAX_TRIP_WINDOW_DAYS));
      let candidate = tripWindowEnd <= maxAllowed ? tripWindowEnd : maxAllowed;
      if (returnEndCap && candidate > returnEndCap) candidate = returnEndCap;
      if (candidate > (windowEnd || "")) {
        windowEnd = candidate;
      }
    }
  }

  if (returnEndCap && windowEnd && windowEnd > returnEndCap) {
    windowEnd = returnEndCap;
  }

  if (windowStart && windowEnd && windowEnd < windowStart && returnEndCap) {
    windowEnd = returnEndCap;
  }

  // Absolute span guard.
  if (windowStart && windowEnd) {
    const span = nightsBetweenInclusive(windowStart, windowEnd);
    if (span > MAX_TRIP_WINDOW_DAYS) {
      windowEnd = addIsoDays(windowStart, MAX_TRIP_WINDOW_DAYS - 1);
      if (returnEndCap && windowEnd > returnEndCap) windowEnd = returnEndCap;
    }
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
      hotelNightsGapActionable: 0,
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
  const hotelNightsGapActionable = actionableGaps.length;

  return {
    windowStart,
    windowEnd,
    nights,
    uncoveredRanges,
    hotelNightsInWindow: inWindow.length,
    hotelNightsCovered,
    hotelNightsSkippedOrHome,
    hotelNightsGap,
    hotelNightsGapActionable,
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

  const gapCount = coverage.hotelNightsGapActionable;
  const ranges = coverage.uncoveredRanges;

  let hotelsTone: CompletenessTone = "gray";
  let hotelsLabel = "No stay nights yet";
  if (coverage.hotelNightsInWindow > 0) {
    if (gapCount === 0) {
      hotelsTone = "green";
      hotelsLabel =
        coverage.hotelNightsSkippedOrHome > 0
          ? "Stays covered (incl. home nights)"
          : "Every night has a stay";
    } else {
      hotelsTone = "orange";
      const rangeBits = ranges
        .slice(0, 2)
        .map((r) => formatStayRangeLabel(r.startNight, r.endNight));
      const more = ranges.length > 2 ? ` +${ranges.length - 2} more` : "";
      hotelsLabel =
        rangeBits.length > 0
          ? `${gapCount} night${gapCount === 1 ? "" : "s"} open · ${rangeBits.join("; ")}${more}`
          : `${gapCount} nights need a stay`;
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
      : overall === "orange" && gapCount > 0
        ? `Tap Hotels to see which ${gapCount} night${gapCount === 1 ? "" : "s"} still need a place.`
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
    firstHotelGap: ranges[0] ?? null,
    hotelGaps: ranges,
    bookedFlightCount,
  };
}
