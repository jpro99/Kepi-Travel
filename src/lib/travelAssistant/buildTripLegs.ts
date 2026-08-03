import { resolveAirport } from "@/lib/airports/lookup";
import { deriveHotelSearchCityFromReservation } from "@/lib/hotels/hotelReservationCity";
import { overlayHotelAnchoredStays } from "@/lib/travelAssistant/hotelAnchoredStayLegs";
import { resolveStayCityForDay } from "@/lib/travelAssistant/dayPlanLines";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import {
  displayHotelForDay,
  type DayPlanRecord,
} from "@/lib/travelAssistant/itineraryDayPlan";
import { buildTripNightCoverage } from "@/lib/travelAssistant/tripNightCoverage";

export const TRAVEL_LEG_COLOR = "#4A6FA5";

/** Stay legs cycle in order — six distinguishable hues (see KEPI_DESIGN_LAW I8, I17). */
export const STAY_LEG_PALETTE = [
  "#C17F59",
  "#2D8A6E",
  "#7B68C8",
  "#C4943A",
] as const;

export interface LegendLegChip {
  id: string;
  label: string;
  color: string;
  startDate: string;
  endDate: string;
  legIds: string[];
  isTravel: boolean;
  isReturn?: boolean;
}

export type TripLegType = "travel" | "stay";

export interface BuiltTripLeg {
  id: string;
  type: TripLegType;
  label: string;
  startDate: string;
  endDate: string;
  color: string;
}

export type DayRibbonPosition = "first" | "middle" | "last" | "single" | "none";

export type DayCellKind = "empty" | "travel" | "stay" | "transition";

export interface DayLegCell {
  dateKey: string;
  kind: DayCellKind;
  legId: string | null;
  color: string | null;
  ribbonPosition: DayRibbonPosition;
  transitionFromColor: string | null;
  transitionToColor: string | null;
  cityName: string | null;
  dayIndexInLeg: number;
  legDayCount: number;
  flightSummary: string | null;
  flightPrimary: { number: string; depTime: string; route: string } | null;
  flightExtraCount: number;
  hotelName: string | null;
  hotelConfirmation: string | null;
  hotelNeeded: boolean;
  hotelBooked: boolean;
  locationOverride: string | null;
}

export interface TripLegCalendarModel {
  legs: BuiltTripLeg[];
  dayCells: Map<string, DayLegCell>;
  legById: Map<string, BuiltTripLeg>;
}

type LegReservation = {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDate?: string;
  checkOutDate?: string;
  location?: string;
  confirmationCode?: string;
};

interface FlightDayGroup {
  depDate: string;
  flights: LegReservation[];
  maxArrivalDate: string;
  finalArrivalAirport: string;
}

function addDays(dateKey: string, days: number): string {
  const ms = Date.parse(`${dateKey}T12:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

function minDateKey(a: string, b: string): string {
  return compareDateKeys(a, b) <= 0 ? a : b;
}

function maxDateKey(a: string, b: string): string {
  return compareDateKeys(a, b) >= 0 ? a : b;
}

export function airportToCity(iata: string | undefined | null): string {
  if (!iata?.trim()) return "Unknown";
  const code = iata.trim().toUpperCase();
  const resolved = resolveAirport(code);
  if (resolved?.city) return resolved.city.split("/")[0]?.trim() ?? resolved.city;
  return code;
}

export function cityToCountry(city: string | null | undefined): string {
  if (!city?.trim()) return "";
  const resolved = resolveAirport(city.trim());
  if (!resolved?.country) return "";
  const names: Record<string, string> = {
    IT: "Italy",
    DE: "Germany",
    FR: "France",
    ES: "Spain",
    GB: "United Kingdom",
    US: "United States",
    JP: "Japan",
  };
  return names[resolved.country] ?? resolved.country;
}

function flightDepartureDate(f: LegReservation): string {
  if (f.flightDate) return f.flightDate.slice(0, 10);
  return f.localTime.trim().slice(0, 10);
}

function flightArrivalDate(f: LegReservation): string {
  const dep = f.flightDepartureTime ?? f.localTime;
  const arr = f.flightArrivalTime;
  if (arr?.trim()) {
    const arrKey = arr.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(arrKey)) return arrKey;
    const depKey = dep.trim().slice(0, 10);
    const depTime = dep.match(/(\d{2}):(\d{2})/)?.[0] ?? "12:00";
    const arrTime = arr.match(/(\d{2}):(\d{2})/)?.[0] ?? "23:59";
    if (arrTime < depTime) return addDays(depKey, 1);
    return depKey;
  }
  return flightDepartureDate(f);
}

function summarizeFlights(flights: LegReservation[]): string {
  if (flights.length === 0) return "Travel";
  const route: string[] = [];
  for (const f of flights) {
    const dep = f.flightDepartureAirport?.toUpperCase() ?? "?";
    const arr = f.flightArrivalAirport?.toUpperCase() ?? "?";
    if (route.length === 0) route.push(dep);
    route.push(arr);
  }
  return route.join(" → ");
}

function shortCityName(city: string): string {
  return city.split(",")[0]?.trim() || city;
}

function sortLegFlightsByDeparture(flights: LegReservation[]): LegReservation[] {
  return [...flights].sort((a, b) => {
    const aKey = `${flightDepartureDate(a)} ${a.flightDepartureTime ?? a.localTime ?? ""}`;
    const bKey = `${flightDepartureDate(b)} ${b.flightDepartureTime ?? b.localTime ?? ""}`;
    return aKey.localeCompare(bKey);
  });
}

/** Place-first Plan labels — city names, not raw airport chains (KEPI_DESIGN_LAW I11). */
export function humanTravelLegLabel(
  flights: LegReservation[],
  options?: { isReturn?: boolean },
): string {
  const sorted = sortLegFlightsByDeparture(flights);
  if (options?.isReturn) {
    if (sorted.length === 0) return "Return home";
    const last = sorted[sorted.length - 1]!;
    const dest = shortCityName(airportToCity(last.flightArrivalAirport));
    return dest && dest !== "Unknown" ? `Return home to ${dest}` : "Return home";
  }
  if (sorted.length === 0) return "Travel day";
  const last = sorted[sorted.length - 1]!;
  const destCity = shortCityName(airportToCity(last.flightArrivalAirport));
  if (sorted.length > 1) return `Fly to ${destCity} · ${sorted.length} flights`;
  const fn = (last.flightNumber ?? "").trim();
  return fn ? `Fly to ${destCity} · ${fn}` : `Fly to ${destCity}`;
}

function formatFlightDepTime(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  let hour = Number(match[1]);
  const min = match[2]!;
  const ampm = hour >= 12 ? "pm" : "am";
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return min === "00" ? `${hour}${ampm}` : `${hour}:${min}${ampm}`;
}

function flightPrimaryDetail(flights: LegReservation[]): {
  primary: DayLegCell["flightPrimary"];
  extraCount: number;
} {
  if (flights.length === 0) return { primary: null, extraCount: 0 };
  const sorted = sortLegFlightsByDeparture(flights);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const dep = first.flightDepartureAirport?.toUpperCase() ?? "?";
  // Multi-leg same-day: show ultimate arrival (MUC→FCO→ONT), not just the first hop.
  const arr = last.flightArrivalAirport?.toUpperCase() ?? "?";
  const mid =
    sorted.length > 2
      ? ` · ${sorted.length - 1} stops`
      : sorted.length === 2
        ? ` via ${first.flightArrivalAirport?.toUpperCase() ?? "?"}`
        : "";
  return {
    primary: {
      number: (first.flightNumber ?? first.title ?? "Flight").trim(),
      depTime: formatFlightDepTime(first.flightDepartureTime ?? first.localTime),
      route: `${dep} → ${arr}${mid}`,
    },
    extraCount: Math.max(0, sorted.length - 1),
  };
}

function stayColorForCity(city: string, index: number): string {
  if (city === "Munich") return STAY_LEG_PALETTE[3]!;
  return STAY_LEG_PALETTE[index % STAY_LEG_PALETTE.length]!;
}

function groupFlightsByDepartureDate(flights: LegReservation[]): FlightDayGroup[] {
  const byDate = new Map<string, LegReservation[]>();
  for (const f of flights) {
    const d = flightDepartureDate(f);
    byDate.set(d, [...(byDate.get(d) ?? []), f]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => compareDateKeys(a, b))
    .map(([depDate, groupFlights]) => {
      const sorted = [...groupFlights].sort((a, b) =>
        flightDepartureDate(a).localeCompare(flightDepartureDate(b)),
      );
      const maxArrivalDate = sorted.reduce(
        (max, f) => maxDateKey(max, flightArrivalDate(f)),
        depDate,
      );
      const finalArrivalAirport = sorted[sorted.length - 1]?.flightArrivalAirport ?? "???";
      return { depDate, flights: sorted, maxArrivalDate, finalArrivalAirport };
    });
}

function hotelOnDay(reservations: LegReservation[], dateKey: string): LegReservation | null {
  for (const r of reservations) {
    if (r.type !== "hotel") continue;
    const start = r.localTime.trim().slice(0, 10);
    const end = r.checkOutDate?.slice(0, 10) ?? "";
    // Presence on calendar: check-in through checkout morning (inclusive end for "last morning").
    if (end) {
      if (start <= dateKey && dateKey <= end) return r;
    } else if (start === dateKey) {
      return r;
    }
  }
  return null;
}

/** Sleep night needs a bed: check-in ≤ night < check-out. */
function hotelCoversSleepOnDay(reservations: LegReservation[], dateKey: string): boolean {
  for (const r of reservations) {
    if (r.type !== "hotel") continue;
    const start = r.localTime.trim().slice(0, 10);
    const end = r.checkOutDate?.slice(0, 10) ?? "";
    if (!start || !end) continue;
    if (start <= dateKey && dateKey < end) return true;
  }
  return false;
}

function flightsOnDay(flights: LegReservation[], dateKey: string): LegReservation[] {
  return flights.filter((f) => flightDepartureDate(f) === dateKey);
}

function legCoversDate(leg: BuiltTripLeg, dateKey: string): boolean {
  return dateKey >= leg.startDate && dateKey <= leg.endDate;
}

function legForDate(legs: BuiltTripLeg[], dateKey: string): BuiltTripLeg | null {
  return resolveLegForDate(legs, dateKey, false);
}

/** When legs overlap (e.g. Venice + Munich), prefer travel on flight days, else the stay that started most recently. */
export function resolveLegForDate(
  legs: BuiltTripLeg[],
  dateKey: string,
  hasFlight: boolean,
): BuiltTripLeg | null {
  const covering = legs.filter((leg) => legCoversDate(leg, dateKey));
  if (covering.length === 0) return null;
  if (covering.length === 1) return covering[0]!;

  if (hasFlight) {
    const travel = covering.find((l) => l.type === "travel");
    if (travel) return travel;
  }

  const stays = covering.filter((l) => l.type === "stay");
  if (stays.length > 0) {
    return stays.sort((a, b) => b.startDate.localeCompare(a.startDate))[0]!;
  }

  return covering.sort((a, b) => b.startDate.localeCompare(a.startDate))[0]!;
}

/**
 * I44 — Split colors only for real overlaps / hotel switches.
 * Do not paint the first full stay day after travel as a false "switch day".
 */
export function resolveDayCellTransition(args: {
  covering: BuiltTripLeg[];
  prevLeg: BuiltTripLeg | null;
  leg: BuiltTripLeg | null;
  hasFlight: boolean;
}): {
  kind: DayCellKind;
  transitionFromColor: string | null;
  transitionToColor: string | null;
} {
  const travelCover = args.covering.find((l) => l.type === "travel") ?? null;
  const stayCover =
    [...args.covering]
      .filter((l) => l.type === "stay")
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;

  // Arrival / departure day: travel + stay both cover → Travel | City split.
  if (travelCover && stayCover) {
    return {
      kind: "transition",
      transitionFromColor: travelCover.color,
      transitionToColor: stayCover.color,
    };
  }

  const baseKind: DayCellKind = args.leg
    ? args.leg.type === "travel"
      ? "travel"
      : "stay"
    : "empty";

  if (!args.prevLeg || !args.leg || args.prevLeg.id === args.leg.id) {
    return { kind: baseKind, transitionFromColor: null, transitionToColor: null };
  }

  // Land transfer between booked stay cities.
  if (args.prevLeg.type === "stay" && args.leg.type === "stay") {
    return {
      kind: "transition",
      transitionFromColor: args.prevLeg.color,
      transitionToColor: args.leg.color,
    };
  }

  // Flight day where the resolved leg changes (e.g. outbound start).
  if (args.hasFlight && (args.prevLeg.type === "travel" || args.leg.type === "travel")) {
    return {
      kind: "transition",
      transitionFromColor: args.prevLeg.color,
      transitionToColor: args.leg.color,
    };
  }

  // First full day in city after travel (no flight today) — solid stay, not "switch day".
  return { kind: baseKind, transitionFromColor: null, transitionToColor: null };
}

function mergeAdjacentLegs(legs: BuiltTripLeg[]): BuiltTripLeg[] {
  if (legs.length === 0) return legs;
  const sorted = [...legs].sort((a, b) => compareDateKeys(a.startDate, b.startDate));
  const merged: BuiltTripLeg[] = [];
  for (const leg of sorted) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.type === leg.type &&
      prev.label === leg.label &&
      prev.color === leg.color &&
      compareDateKeys(addDays(prev.endDate, 1), leg.startDate) >= 0
    ) {
      prev.endDate = maxDateKey(prev.endDate, leg.endDate);
      prev.startDate = minDateKey(prev.startDate, leg.startDate);
    } else {
      merged.push({ ...leg });
    }
  }
  return merged;
}

function fillCoverageGaps(legs: BuiltTripLeg[], tripStart: string, tripEnd: string): BuiltTripLeg[] {
  const dayKeys = buildFullTripDayKeys(tripStart, tripEnd, []);
  let result = mergeAdjacentLegs([...legs]);

  // Do not invent stay days after the final return travel leg (Jeff Europe calendar:
  // MUC→home on the 25th must not paint 26–28 as "still in Munich").
  const lastTravelEnd = [...result]
    .filter((l) => l.type === "travel")
    .sort((a, b) => compareDateKeys(b.endDate, a.endDate))[0]?.endDate;
  const coverageEnd =
    lastTravelEnd && compareDateKeys(lastTravelEnd, tripEnd) < 0 ? lastTravelEnd : tripEnd;

  const uncovered = dayKeys.filter((dk) => {
    if (compareDateKeys(dk, coverageEnd) > 0) return false;
    return !legForDate(result, dk);
  });
  if (uncovered.length === 0) return result;

  const ranges: Array<{ start: string; end: string }> = [];
  let rangeStart = uncovered[0]!;
  let prev = uncovered[0]!;
  for (let i = 1; i < uncovered.length; i += 1) {
    const dk = uncovered[i]!;
    if (addDays(prev, 1) === dk) {
      prev = dk;
    } else {
      ranges.push({ start: rangeStart, end: prev });
      rangeStart = dk;
      prev = dk;
    }
  }
  ranges.push({ start: rangeStart, end: prev });

  let stayColorIndex = result.filter((l) => l.type === "stay").length;
  for (const range of ranges) {
    // Never stretch a European stay into days after the last travel (return) day.
    if (lastTravelEnd && compareDateKeys(range.start, lastTravelEnd) > 0) {
      continue;
    }
    const cappedEnd =
      lastTravelEnd && compareDateKeys(range.end, lastTravelEnd) > 0 ? lastTravelEnd : range.end;
    if (compareDateKeys(range.start, cappedEnd) > 0) continue;

    const before = [...result]
      .filter((l) => l.endDate < range.start)
      .sort((a, b) => compareDateKeys(b.endDate, a.endDate))[0];
    const after = [...result]
      .filter((l) => l.startDate > cappedEnd)
      .sort((a, b) => compareDateKeys(a.startDate, b.startDate))[0];

    if (before?.type === "stay" && after?.type === "stay" && before.label !== after.label) {
      const boundary = addDays(after.startDate, -1);
      if (compareDateKeys(cappedEnd, boundary) <= 0) {
        before.endDate = maxDateKey(before.endDate, cappedEnd);
      } else if (compareDateKeys(range.start, after.startDate) >= 0) {
        after.startDate = minDateKey(after.startDate, range.start);
      } else {
        if (compareDateKeys(range.start, boundary) <= 0) {
          before.endDate = maxDateKey(before.endDate, boundary);
        }
        after.startDate = minDateKey(after.startDate, range.start);
      }
      continue;
    }

    if (after?.type === "stay") {
      after.startDate = minDateKey(after.startDate, range.start);
      continue;
    }

    if (before?.type === "stay" && !after) {
      // Cap stay extension at the day before return travel when return sits on coverageEnd.
      const stayCap =
        lastTravelEnd && compareDateKeys(lastTravelEnd, cappedEnd) === 0
          ? addDays(lastTravelEnd, -1)
          : cappedEnd;
      if (compareDateKeys(stayCap, before.startDate) >= 0) {
        before.endDate = maxDateKey(before.endDate, minDateKey(stayCap, cappedEnd));
      }
      continue;
    }

    const label = before?.label ?? after?.label ?? "Trip";
    const color = stayColorForCity(label, stayColorIndex);
    stayColorIndex += 1;
    result.push({
      id: `leg-fill-${result.length}`,
      type: "stay",
      label,
      startDate: range.start,
      endDate: cappedEnd,
      color,
    });
  }

  return mergeAdjacentLegs(result);
}

function trimOverlappingStays(legs: BuiltTripLeg[]): BuiltTripLeg[] {
  const sorted = [...legs].sort((a, b) => compareDateKeys(a.startDate, b.startDate));
  const stays = sorted.filter((l) => l.type === "stay");
  for (let i = 0; i < stays.length; i += 1) {
    for (let j = i + 1; j < stays.length; j += 1) {
      const left = stays[i]!;
      const right = stays[j]!;
      if (left.label === right.label) continue;
      if (compareDateKeys(left.endDate, right.startDate) >= 0) {
        left.endDate = addDays(right.startDate, -1);
      }
    }
  }
  return sorted.filter((leg) => leg.type !== "stay" || compareDateKeys(leg.startDate, leg.endDate) <= 0);
}

function inferReturnCityStay(legs: BuiltTripLeg[], groups: FlightDayGroup[]): BuiltTripLeg[] {
  if (groups.length < 2) return legs;
  const last = groups[groups.length - 1]!;
  const returnDep = last.flights[0]?.flightDepartureAirport ?? "";
  const returnCity = airportToCity(returnDep);
  const hasArrivalAtReturn = groups.slice(0, -1).some(
    (g) => airportToCity(g.finalArrivalAirport) === returnCity,
  );
  if (hasArrivalAtReturn) return legs;

  const lastStay = [...legs].reverse().find((l) => l.type === "stay");
  if (!lastStay || lastStay.label === returnCity) return legs;

  const stayEnd = addDays(last.depDate, -1);
  let stayStart = addDays(stayEnd, -4);
  if (compareDateKeys(stayStart, lastStay.startDate) < 0) {
    stayStart = addDays(lastStay.startDate, 1);
  }
  const trimmedEnd = addDays(stayStart, -1);
  if (compareDateKeys(trimmedEnd, lastStay.startDate) >= 0) {
    lastStay.endDate = trimmedEnd;
  }
  if (compareDateKeys(stayEnd, stayStart) < 0) return legs;

  const color = stayColorForCity(returnCity, legs.filter((l) => l.type === "stay").length);
  legs.push({
    id: `leg-stay-return-${returnCity}`,
    type: "stay",
    label: returnCity,
    startDate: stayStart,
    endDate: stayEnd,
    color,
  });
  return legs;
}

export interface BuildTripLegsOptions {
  dayNotes?: Record<string, string>;
  dayPlans?: Record<string, DayPlanRecord>;
}

export function buildTripLegs(
  reservations: LegReservation[],
  tripStartDate: string | null,
  tripEndDate: string | null,
  options: BuildTripLegsOptions = {},
): BuiltTripLeg[] {
  const tripStart = tripStartDate?.slice(0, 10) ?? null;
  const tripEnd = tripEndDate?.slice(0, 10) ?? null;
  if (!tripStart || !tripEnd) return [];

  const flights = reservations
    .filter((r) => r.type === "flight")
    .sort((a, b) => compareDateKeys(flightDepartureDate(a), flightDepartureDate(b)));

  const legs: BuiltTripLeg[] = [];
  let stayColorIndex = 0;

  const addStay = (start: string, end: string, cityIata: string, suffix = ""): void => {
    if (compareDateKeys(start, end) > 0) return;
    const city = airportToCity(cityIata);
    const color = stayColorForCity(city, stayColorIndex);
    stayColorIndex += 1;
    legs.push({
      id: `leg-stay-${legs.length}${suffix}`,
      type: "stay",
      label: city,
      startDate: start,
      endDate: end,
      color,
    });
  };

  const addTravel = (start: string, end: string, label: string, idSuffix: string): void => {
    if (compareDateKeys(start, end) > 0) return;
    legs.push({
      id: `leg-travel-${idSuffix}`,
      type: "travel",
      label,
      startDate: start,
      endDate: end,
      color: TRAVEL_LEG_COLOR,
    });
  };

  if (flights.length === 0) {
    addStay(tripStart, tripEnd, "Trip", "-full");
    return legs;
  }

  const groups = groupFlightsByDepartureDate(flights);

  if (groups.length === 1) {
    const g = groups[0]!;
    addTravel(tripStart, g.maxArrivalDate, humanTravelLegLabel(g.flights), "outbound");
    if (compareDateKeys(g.maxArrivalDate, tripEnd) < 0) {
      addStay(g.maxArrivalDate, tripEnd, g.finalArrivalAirport, "-solo");
    }
    return finalizeTripLegs(legs, groups, reservations, tripStart, tripEnd, options);
  }

  const first = groups[0]!;
  addTravel(tripStart, first.maxArrivalDate, humanTravelLegLabel(first.flights), "outbound");

  for (let i = 0; i < groups.length; i += 1) {
    const g = groups[i]!;
    const next = groups[i + 1];
    if (next) {
      const stayStart = g.maxArrivalDate;
      const stayEnd = addDays(next.depDate, -1);
      if (compareDateKeys(stayStart, stayEnd) <= 0) {
        addStay(stayStart, stayEnd, g.finalArrivalAirport, `-${i}`);
      }
      addTravel(next.depDate, next.depDate, humanTravelLegLabel(next.flights), `seg-${i + 1}`);
    } else {
      addTravel(g.depDate, g.depDate, humanTravelLegLabel(g.flights, { isReturn: true }), "return");
    }
  }

  return finalizeTripLegs(legs, groups, reservations, tripStart, tripEnd, options);
}

function finalizeTripLegs(
  legs: BuiltTripLeg[],
  groups: FlightDayGroup[],
  reservations: LegReservation[],
  tripStart: string,
  tripEnd: string,
  options: BuildTripLegsOptions,
): BuiltTripLeg[] {
  const hotels = reservations.filter((r) => r.type === "hotel");
  let result = trimOverlappingStays(
    fillCoverageGaps(inferReturnCityStay(legs, groups), tripStart, tripEnd),
  );

  if (hotels.length > 0 || Object.keys(options.dayPlans ?? {}).length > 0) {
    result = overlayHotelAnchoredStays({
      legs: result,
      hotels,
      tripStart,
      tripEnd,
      dayNotes: options.dayNotes,
      dayPlans: options.dayPlans,
      stayColorForCity: stayColorForCity,
    });
    result = trimOverlappingStays(fillCoverageGaps(result, tripStart, tripEnd));
  }

  return result;
}

export interface BuildTripLegCalendarOptions {
  dayPlans?: Record<string, DayPlanRecord>;
  dayNotes?: Record<string, string>;
  legLabelOverrides?: Record<string, string>;
}

export function buildTripLegCalendarModel(
  reservations: LegReservation[],
  tripStartDate: string | null,
  tripEndDate: string | null,
  options: BuildTripLegCalendarOptions = {},
): TripLegCalendarModel {
  const legs = buildTripLegs(reservations, tripStartDate, tripEndDate, {
    dayNotes: options.dayNotes,
    dayPlans: options.dayPlans,
  }).map((leg) => {
    const override = options.legLabelOverrides?.[leg.id];
    return override ? { ...leg, label: override } : leg;
  });
  const dayCells = new Map<string, DayLegCell>();
  const legById = new Map<string, BuiltTripLeg>();
  for (const leg of legs) legById.set(leg.id, leg);

  const dayKeys = buildFullTripDayKeys(tripStartDate, tripEndDate, reservations);
  const flights = reservations.filter((r) => r.type === "flight");
  // Shared sleep truth with Home / Stay Gaps (I34 / I35).
  const nightCoverage = buildTripNightCoverage({
    reservations,
    tripStartDate,
    tripEndDate,
  });
  const gapNights = new Set(
    nightCoverage.nights.filter((n) => n.status === "gap").map((n) => n.dateKey),
  );
  const coveredNights = new Set(
    nightCoverage.nights.filter((n) => n.status === "covered").map((n) => n.dateKey),
  );

  for (let i = 0; i < dayKeys.length; i += 1) {
    const dateKey = dayKeys[i]!;
    const dayFlights = flightsOnDay(flights, dateKey);
    const hasFlight = dayFlights.length > 0;
    const leg = resolveLegForDate(legs, dateKey, hasFlight);
    const prevDayFlights = i > 0 ? flightsOnDay(flights, dayKeys[i - 1]!) : [];
    const prevLeg = i > 0 ? resolveLegForDate(legs, dayKeys[i - 1]!, prevDayFlights.length > 0) : null;
    const covering = legs.filter((candidate) => legCoversDate(candidate, dateKey));
    const hotel = hotelOnDay(reservations, dateKey);
    const sleepCovered = hotelCoversSleepOnDay(reservations, dateKey) || coveredNights.has(dateKey);
    const dayPlan = options.dayPlans?.[dateKey];
    const reservationHotel = hotel
      ? hotel.title?.trim() || hotel.provider?.trim() || hotel.location || "Hotel"
      : null;
    const hotelDisplay = displayHotelForDay({ plan: dayPlan, reservationHotel });
    // Prefer real sleep coverage over day-plan "booked" flags when checkout is known.
    const sleepBooked = sleepCovered || Boolean(hotelDisplay.booked && !hotel?.checkOutDate);
    const flightDetail = flightPrimaryDetail(dayFlights);
    const hotelCity = hotel
      ? deriveHotelSearchCityFromReservation({
          id: hotel.id,
          title: hotel.title,
          provider: hotel.provider,
          location: hotel.location,
          localTime: hotel.localTime,
          checkOutDate: hotel.checkOutDate,
        })
      : null;
    const noteCity = resolveStayCityForDay(
      dateKey,
      options.dayNotes ?? {},
      [],
      tripStartDate,
      tripEndDate,
    );
    // Sleep truth: booked hotel city beats leftover day-plan notes (I44).
    const displayCity =
      hotelCity ||
      dayPlan?.location?.trim() ||
      (leg?.type === "stay" ? leg.label : null) ||
      noteCity;

    const transition = resolveDayCellTransition({
      covering,
      prevLeg,
      leg,
      hasFlight,
    });
    let kind: DayCellKind = transition.kind;
    let transitionFromColor = transition.transitionFromColor;
    let transitionToColor = transition.transitionToColor;

    const legDays = leg ? dayKeys.filter((k) => k >= leg.startDate && k <= leg.endDate) : [];
    const dayIndexInLeg = leg ? legDays.indexOf(dateKey) + 1 : 0;
    const hotelNeeded = gapNights.has(dateKey);

    dayCells.set(dateKey, {
      dateKey,
      kind: hotelNeeded && kind === "empty" ? "stay" : kind,
      legId: leg?.id ?? null,
      color: hotelNeeded && !leg ? "#FF9F0A" : leg?.color ?? null,
      ribbonPosition:
        leg && leg.startDate === leg.endDate
          ? "single"
          : leg && dateKey === leg.startDate
            ? "first"
            : leg && dateKey === leg.endDate
              ? "last"
              : leg
                ? "middle"
                : hotelNeeded
                  ? "single"
                  : "none",
      transitionFromColor,
      transitionToColor,
      cityName: displayCity,
      dayIndexInLeg,
      legDayCount: legDays.length,
      flightSummary: hasFlight ? summarizeFlights(dayFlights) : null,
      flightPrimary: hasFlight ? flightDetail.primary : null,
      flightExtraCount: hasFlight ? flightDetail.extraCount : 0,
      hotelName: hotelDisplay.label || (sleepCovered && reservationHotel ? reservationHotel : null),
      hotelConfirmation: dayPlan?.hotelConfirmation?.trim() || hotel?.confirmationCode?.trim() || null,
      hotelNeeded,
      hotelBooked: Boolean(sleepBooked && !hotelNeeded),
      locationOverride: dayPlan?.location?.trim() || null,
    });
  }

  return { legs, dayCells, legById };
}

export function ribbonPositionForGridCell(args: {
  dateKey: string;
  leg: BuiltTripLeg;
  monthDayKeys: string[];
  firstDow: number;
}): DayRibbonPosition {
  const { dateKey, leg, monthDayKeys, firstDow } = args;
  const gridWeekRow = (key: string): number => {
    const idx = monthDayKeys.indexOf(key);
    if (idx < 0) return -1;
    return Math.floor((idx + firstDow) / 7);
  };
  const legDays = monthDayKeys.filter((k) => k >= leg.startDate && k <= leg.endDate);
  if (legDays.length === 0) return "none";
  if (legDays.length === 1) return "single";
  const row = gridWeekRow(dateKey);
  const rowDays = legDays.filter((k) => gridWeekRow(k) === row).sort();
  const pos = rowDays.indexOf(dateKey);
  if (pos < 0) return "middle";
  if (rowDays.length === 1) return "single";
  if (pos === 0) return "first";
  if (pos === rowDays.length - 1) return "last";
  return "middle";
}

export function cellFillStyle(cell: DayLegCell, opacity = "E6"): { background?: string; backgroundColor?: string } {
  // Amber wash for real sleep gaps — readable "needs stay" (I35). Keep split colors on transitions.
  if (cell.hotelNeeded && cell.kind !== "transition") {
    return { backgroundColor: `#FF9F0A${opacity}` };
  }
  if (cell.kind === "transition" && cell.transitionFromColor && cell.transitionToColor) {
    return {
      background: `linear-gradient(90deg, ${cell.transitionFromColor}${opacity} 50%, ${cell.transitionToColor}${opacity} 50%)`,
    };
  }
  if (cell.color) {
    return { backgroundColor: `${cell.color}${opacity}` };
  }
  return {};
}

export function ribbonRadiusClass(position: DayRibbonPosition): string {
  switch (position) {
    case "first":
      return "rounded-l-[12px] rounded-r-none";
    case "last":
      return "rounded-r-[12px] rounded-l-none";
    case "single":
      return "rounded-[12px]";
    default:
      return "rounded-none";
  }
}

export function formatLegChipRange(leg: BuiltTripLeg): string {
  const fmt = (key: string) =>
    new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (leg.startDate === leg.endDate) return fmt(leg.startDate);
  const endFmt = new Date(`${leg.endDate}T12:00:00`).toLocaleDateString("en-US", { day: "numeric" });
  return `${fmt(leg.startDate)}–${endFmt}`;
}

/** Hotel-style nights: checkout − check-in in whole days (not inclusive day count). */
export function countNights(start: string, end: string): number {
  const ms = Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`);
  const diff = Math.round(ms / 86_400_000);
  if (diff <= 0) return 1;
  return diff;
}

export function flightDedupeKey(f: {
  flightNumber?: string;
  flightDepartureTime?: string;
  localTime: string;
}): string {
  const fn = (f.flightNumber ?? "").trim().toUpperCase();
  const dep = (f.flightDepartureTime ?? f.localTime ?? "").trim();
  return `${fn}|${dep}`;
}

export function dedupeFlights<T extends {
  flightNumber?: string;
  flightDepartureTime?: string;
  localTime: string;
}>(flights: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const f of flights) {
    const key = flightDedupeKey(f);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function legColorForDate(model: TripLegCalendarModel, dateKey: string): string | null {
  return model.dayCells.get(dateKey)?.color ?? null;
}

function mergeTravelLegendGroup(
  group: BuiltTripLeg[],
  label: string,
  id: string,
  isReturn = false,
): LegendLegChip {
  return {
    id,
    label,
    color: TRAVEL_LEG_COLOR,
    startDate: group[0]!.startDate,
    endDate: group[group.length - 1]!.endDate,
    legIds: group.map((g) => g.id),
    isTravel: true,
    isReturn,
  };
}

/** At most one outbound travel chip, each stay, one return travel chip — max ~6 legend items. */
export function buildLegendLegs(legs: BuiltTripLeg[]): LegendLegChip[] {
  const sorted = [...legs].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (sorted.length === 0) return [];

  const chips: LegendLegChip[] = [];
  const firstStayIdx = sorted.findIndex((l) => l.type === "stay");
  const lastStayIdx = sorted.reduce((acc, l, i) => (l.type === "stay" ? i : acc), -1);

  if (firstStayIdx > 0) {
    const outbound = sorted.slice(0, firstStayIdx).filter((l) => l.type === "travel");
    if (outbound.length > 0) chips.push(mergeTravelLegendGroup(outbound, "Travel", "legend-travel-out"));
  } else if (firstStayIdx === -1) {
    const allTravel = sorted.filter((l) => l.type === "travel");
    if (allTravel.length > 0) {
      chips.push(mergeTravelLegendGroup(allTravel, "Travel", "legend-travel-out"));
    }
    return chips;
  }

  for (const leg of sorted) {
    if (leg.type === "stay") {
      chips.push({
        id: leg.id,
        label: leg.label,
        color: leg.color,
        startDate: leg.startDate,
        endDate: leg.endDate,
        legIds: [leg.id],
        isTravel: false,
      });
    }
  }

  if (lastStayIdx >= 0 && lastStayIdx < sorted.length - 1) {
    const ret = sorted.slice(lastStayIdx + 1).filter((l) => l.type === "travel");
    if (ret.length > 0) {
      chips.push(mergeTravelLegendGroup(ret, "Return", "legend-travel-return", true));
    }
  }

  return chips;
}
