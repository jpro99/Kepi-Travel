import { resolveAirport } from "@/lib/airports/lookup";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";

export const TRAVEL_LEG_COLOR = "#4A6FA5";

/** Stay legs cycle in order — visually distinct at a glance (see KEPI_DESIGN_LAW I8). */
export const STAY_LEG_PALETTE = [
  "#C17F59",
  "#2D8A6E",
  "#7B68C8",
  "#C4943A",
  "#8B3A52",
  "#2E9E8F",
] as const;

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
  hotelName: string | null;
  hotelNeeded: boolean;
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
    const end = r.checkOutDate?.slice(0, 10) ?? start;
    if (start <= dateKey && dateKey <= end) return r;
  }
  return null;
}

function flightsOnDay(flights: LegReservation[], dateKey: string): LegReservation[] {
  return flights.filter((f) => flightDepartureDate(f) === dateKey);
}

function legCoversDate(leg: BuiltTripLeg, dateKey: string): boolean {
  return dateKey >= leg.startDate && dateKey <= leg.endDate;
}

function legForDate(legs: BuiltTripLeg[], dateKey: string): BuiltTripLeg | null {
  for (const leg of legs) {
    if (legCoversDate(leg, dateKey)) return leg;
  }
  return null;
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
  const uncovered = dayKeys.filter((dk) => !legForDate(result, dk));
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
    const before = [...result]
      .filter((l) => l.endDate < range.start)
      .sort((a, b) => compareDateKeys(b.endDate, a.endDate))[0];
    const after = [...result]
      .filter((l) => l.startDate > range.end)
      .sort((a, b) => compareDateKeys(a.startDate, b.startDate))[0];

    if (before?.type === "stay") {
      before.endDate = maxDateKey(before.endDate, range.end);
      continue;
    }
    if (after?.type === "stay") {
      after.startDate = minDateKey(after.startDate, range.start);
      continue;
    }

    const label = before?.label ?? after?.label ?? "Trip";
    const color = STAY_LEG_PALETTE[stayColorIndex % STAY_LEG_PALETTE.length]!;
    stayColorIndex += 1;
    result.push({
      id: `leg-fill-${result.length}`,
      type: "stay",
      label,
      startDate: range.start,
      endDate: range.end,
      color,
    });
  }

  return mergeAdjacentLegs(result);
}

export function buildTripLegs(
  reservations: LegReservation[],
  tripStartDate: string | null,
  tripEndDate: string | null,
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
    const color = STAY_LEG_PALETTE[stayColorIndex % STAY_LEG_PALETTE.length]!;
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
    addTravel(tripStart, g.maxArrivalDate, summarizeFlights(g.flights), "outbound");
    if (compareDateKeys(g.maxArrivalDate, tripEnd) < 0) {
      addStay(g.maxArrivalDate, tripEnd, g.finalArrivalAirport, "-solo");
    }
    return fillCoverageGaps(legs, tripStart, tripEnd);
  }

  const first = groups[0]!;
  addTravel(tripStart, first.maxArrivalDate, summarizeFlights(first.flights), "outbound");

  for (let i = 0; i < groups.length; i += 1) {
    const g = groups[i]!;
    const next = groups[i + 1];
    if (next) {
      const stayStart = g.maxArrivalDate;
      const stayEnd = addDays(next.depDate, -1);
      if (compareDateKeys(stayStart, stayEnd) <= 0) {
        addStay(stayStart, stayEnd, g.finalArrivalAirport, `-${i}`);
      }
      addTravel(next.depDate, next.depDate, summarizeFlights(next.flights), `seg-${i + 1}`);
    } else {
      const depCity = airportToCity(g.flights[0]?.flightDepartureAirport);
      addTravel(g.depDate, g.depDate, `${depCity} → Home`, "return");
    }
  }

  return fillCoverageGaps(legs, tripStart, tripEnd);
}

export function buildTripLegCalendarModel(
  reservations: LegReservation[],
  tripStartDate: string | null,
  tripEndDate: string | null,
): TripLegCalendarModel {
  const legs = buildTripLegs(reservations, tripStartDate, tripEndDate);
  const dayCells = new Map<string, DayLegCell>();
  const legById = new Map<string, BuiltTripLeg>();
  for (const leg of legs) legById.set(leg.id, leg);

  const dayKeys = buildFullTripDayKeys(tripStartDate, tripEndDate, reservations);
  const flights = reservations.filter((r) => r.type === "flight");

  for (let i = 0; i < dayKeys.length; i += 1) {
    const dateKey = dayKeys[i]!;
    const leg = legForDate(legs, dateKey);
    const prevLeg = i > 0 ? legForDate(legs, dayKeys[i - 1]!) : null;
    const dayFlights = flightsOnDay(flights, dateKey);
    const hotel = hotelOnDay(reservations, dateKey);
    const hasFlight = dayFlights.length > 0;

    let kind: DayCellKind = leg ? (leg.type === "travel" ? "travel" : "stay") : "empty";
    let transitionFromColor: string | null = null;
    let transitionToColor: string | null = null;

    if (hasFlight && prevLeg && leg && prevLeg.id !== leg.id) {
      kind = "transition";
      transitionFromColor = prevLeg.color;
      transitionToColor = leg.color;
    }

    const legDays = leg ? dayKeys.filter((k) => k >= leg.startDate && k <= leg.endDate) : [];
    const dayIndexInLeg = leg ? legDays.indexOf(dateKey) + 1 : 0;

    dayCells.set(dateKey, {
      dateKey,
      kind,
      legId: leg?.id ?? null,
      color: leg?.color ?? null,
      ribbonPosition:
        leg && leg.startDate === leg.endDate
          ? "single"
          : leg && dateKey === leg.startDate
            ? "first"
            : leg && dateKey === leg.endDate
              ? "last"
              : leg
                ? "middle"
                : "none",
      transitionFromColor,
      transitionToColor,
      cityName: leg?.type === "stay" ? leg.label : null,
      dayIndexInLeg,
      legDayCount: legDays.length,
      flightSummary: hasFlight ? summarizeFlights(dayFlights) : null,
      hotelName: hotel ? hotel.provider || hotel.title || hotel.location || "Hotel" : null,
      hotelNeeded: Boolean(leg?.type === "stay" && !hotel),
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
