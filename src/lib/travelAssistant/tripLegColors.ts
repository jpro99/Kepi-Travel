import { resolveStayCityForDay } from "@/lib/travelAssistant/dayPlanLines";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";
import type { StopDateRange } from "@/lib/decision/stopDates";

/** Travel / flight days — fixed palette slot, not destination-indexed. */
export const TRAVEL_LEG_COLOR = "#4A6FA5";

/** Destination legs assigned in chronological order of first appearance. */
export const DESTINATION_LEG_PALETTE = [
  "#C17F59",
  "#2E9E8F",
  "#4A7C59",
  "#8B3A52",
  "#7B68C8",
  "#C4943A",
  "#4A8B8B",
] as const;

export type TripLegKind = "travel" | "destination";

export interface TripLeg {
  id: string;
  kind: TripLegKind;
  label: string;
  color: string;
  startDateKey: string;
  endDateKey: string;
}

export type DayCellPosition = "first" | "middle" | "last" | "single" | "none";

export type DayCellKind = "empty" | "travel" | "destination" | "transition";

export interface DayLegCell {
  dateKey: string;
  kind: DayCellKind;
  legId: string | null;
  color: string | null;
  position: DayCellPosition;
  transitionFromColor: string | null;
  transitionToColor: string | null;
  cityName: string | null;
  dayIndexInLeg: number;
  legDayCount: number;
  flightSummary: string | null;
  hotelName: string | null;
  hotelNeeded: boolean;
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
  flightDate?: string;
  checkOutDate?: string;
  location?: string;
};

export interface TripLegModel {
  legs: TripLeg[];
  dayCells: Map<string, DayLegCell>;
  legById: Map<string, TripLeg>;
}

function normalizeCity(city: string | null | undefined): string | null {
  if (!city?.trim()) return null;
  return city.split("(")[0]?.trim() ?? city.trim();
}

function reservationDateKey(reservation: LegReservation): string {
  if (reservation.type === "flight" && reservation.flightDate) return reservation.flightDate.slice(0, 10);
  return reservation.localTime.trim().slice(0, 10);
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

function flightsOnDay(reservations: LegReservation[], dateKey: string): LegReservation[] {
  return reservations.filter((r) => r.type === "flight" && reservationDateKey(r) === dateKey);
}

function flightSummary(flight: LegReservation): string {
  const dep = flight.flightDepartureAirport ?? "???";
  const arr = flight.flightArrivalAirport ?? "???";
  const fn = flight.flightNumber?.trim();
  return fn ? `${fn} · ${dep} → ${arr}` : `${dep} → ${arr}`;
}

function positionInRun(dateKey: string, start: string, end: string): DayCellPosition {
  if (start === end) return "single";
  if (dateKey === start) return "first";
  if (dateKey === end) return "last";
  return "middle";
}

interface DestinationRun {
  city: string;
  startDateKey: string;
  endDateKey: string;
  legId: string;
  color: string;
}

export function buildTripLegModel(args: {
  tripStartDate: string | null;
  tripEndDate: string | null;
  dayNotes: Record<string, string>;
  stopRanges?: StopDateRange[];
  reservations: LegReservation[];
}): TripLegModel {
  const { tripStartDate, tripEndDate, dayNotes, stopRanges = [], reservations } = args;
  const dayKeys = buildFullTripDayKeys(tripStartDate, tripEndDate, reservations);
  const legs: TripLeg[] = [];
  const dayCells = new Map<string, DayLegCell>();
  const legById = new Map<string, TripLeg>();

  if (dayKeys.length === 0) {
    return { legs, dayCells, legById };
  }

  const destRuns: DestinationRun[] = [];
  let destPaletteIndex = 0;
  let current: DestinationRun | null = null;

  for (const dateKey of dayKeys) {
    const city = normalizeCity(
      resolveStayCityForDay(dateKey, dayNotes, stopRanges, tripStartDate, tripEndDate),
    );
    if (!city) {
      if (current) destRuns.push(current);
      current = null;
      continue;
    }
    if (current?.city === city) {
      current.endDateKey = dateKey;
    } else {
      if (current) destRuns.push(current);
      const legId = `dest-${destRuns.length}`;
      const color = DESTINATION_LEG_PALETTE[destPaletteIndex % DESTINATION_LEG_PALETTE.length]!;
      destPaletteIndex += 1;
      current = { city, startDateKey: dateKey, endDateKey: dateKey, legId, color };
    }
  }
  if (current) destRuns.push(current);

  for (const run of destRuns) {
    const leg: TripLeg = {
      id: run.legId,
      kind: "destination",
      label: run.city,
      color: run.color,
      startDateKey: run.startDateKey,
      endDateKey: run.endDateKey,
    };
    legs.push(leg);
    legById.set(leg.id, leg);
  }

  const runForDate = (dateKey: string): DestinationRun | null =>
    destRuns.find((run) => dateKey >= run.startDateKey && dateKey <= run.endDateKey) ?? null;

  const runIndex = (run: DestinationRun): number => destRuns.indexOf(run);

  for (let i = 0; i < dayKeys.length; i += 1) {
    const dateKey = dayKeys[i]!;
    const run = runForDate(dateKey);
    const dayFlights = flightsOnDay(reservations, dateKey);
    const hotel = hotelOnDay(reservations, dateKey);
    const hasFlight = dayFlights.length > 0;
    const cityName = run?.city ?? null;
    const hotelNeeded = Boolean(cityName && !hotel);

    let kind: DayCellKind = "empty";
    let color: string | null = null;
    let legId: string | null = null;
    let transitionFromColor: string | null = null;
    let transitionToColor: string | null = null;
    let position: DayCellPosition = "none";
    let dayIndexInLeg = 0;
    let legDayCount = 0;

    const prevRun = i > 0 ? runForDate(dayKeys[i - 1]!) : null;
    const isFirstDayOfRun = run ? run.startDateKey === dateKey : false;

    if (hasFlight && run && isFirstDayOfRun && prevRun && prevRun.legId !== run.legId) {
      kind = "transition";
      transitionFromColor = prevRun.color;
      transitionToColor = run.color;
      legId = run.legId;
      color = run.color;
      position = positionInRun(dateKey, run.startDateKey, run.endDateKey);
      dayIndexInLeg = 1;
      legDayCount = countDaysInRun(run, dayKeys);
    } else if (hasFlight && !run) {
      kind = "travel";
      color = TRAVEL_LEG_COLOR;
      legId = `travel-${dateKey}`;
      position = "single";
      dayIndexInLeg = 1;
      legDayCount = 1;
      if (!legs.some((l) => l.id === legId)) {
        const travelLeg: TripLeg = {
          id: legId,
          kind: "travel",
          label: dayFlights[0] ? flightSummary(dayFlights[0]) : "Travel",
          color: TRAVEL_LEG_COLOR,
          startDateKey: dateKey,
          endDateKey: dateKey,
        };
        legs.push(travelLeg);
        legById.set(travelLeg.id, travelLeg);
      }
    } else if (hasFlight && run) {
      kind = "travel";
      color = TRAVEL_LEG_COLOR;
      legId = `travel-${dateKey}`;
      position = "single";
      dayIndexInLeg = 1;
      legDayCount = 1;
      if (!legs.some((l) => l.id === legId)) {
        const travelLeg: TripLeg = {
          id: legId,
          kind: "travel",
          label: dayFlights[0] ? flightSummary(dayFlights[0]) : "Travel",
          color: TRAVEL_LEG_COLOR,
          startDateKey: dateKey,
          endDateKey: dateKey,
        };
        legs.push(travelLeg);
        legById.set(travelLeg.id, travelLeg);
      }
    } else if (run) {
      kind = "destination";
      color = run.color;
      legId = run.legId;
      position = positionInRun(dateKey, run.startDateKey, run.endDateKey);
      dayIndexInLeg = countDaysInRun(run, dayKeys.slice(0, i + 1).filter(
        (k) => k >= run.startDateKey && k <= run.endDateKey,
      ));
      legDayCount = countDaysInRun(run, dayKeys);
    } else if (prevRun && !run) {
      kind = "travel";
      color = TRAVEL_LEG_COLOR;
      legId = `travel-gap-${dateKey}`;
      position = "single";
      dayIndexInLeg = 1;
      legDayCount = 1;
    }

    dayCells.set(dateKey, {
      dateKey,
      kind,
      legId,
      color,
      position,
      transitionFromColor,
      transitionToColor,
      cityName,
      dayIndexInLeg,
      legDayCount,
      flightSummary: hasFlight ? flightSummary(dayFlights[0]!) : null,
      hotelName: hotel ? hotel.provider || hotel.title || hotel.location || "Hotel" : null,
      hotelNeeded,
    });
  }

  legs.sort((a, b) => a.startDateKey.localeCompare(b.startDateKey));

  return { legs, dayCells, legById };
}

function countDaysInRun(run: DestinationRun, dayKeys: string[]): number {
  return dayKeys.filter((k) => k >= run.startDateKey && k <= run.endDateKey).length;
}

export function legColorForDate(model: TripLegModel, dateKey: string): string | null {
  return model.dayCells.get(dateKey)?.color ?? null;
}

export function destinationLegs(model: TripLegModel): TripLeg[] {
  return model.legs.filter((leg) => leg.kind === "destination");
}

export function formatLegDateRange(leg: TripLeg): string {
  const start = new Date(`${leg.startDateKey}T12:00:00`);
  const end = new Date(`${leg.endDateKey}T12:00:00`);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (leg.startDateKey === leg.endDateKey) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

export function cellRadiusClass(position: DayCellPosition): string {
  switch (position) {
    case "first":
      return "rounded-l-2xl rounded-r-none";
    case "last":
      return "rounded-r-2xl rounded-l-none";
    case "single":
      return "rounded-2xl";
    default:
      return "rounded-none";
  }
}

export function cellFillStyle(cell: DayLegCell): { background?: string; backgroundColor?: string } {
  if (cell.kind === "transition" && cell.transitionFromColor && cell.transitionToColor) {
    return {
      background: `linear-gradient(90deg, ${cell.transitionFromColor}D9 50%, ${cell.transitionToColor}D9 50%)`,
    };
  }
  if (cell.color) {
    return { backgroundColor: `${cell.color}D9` };
  }
  return {};
}
