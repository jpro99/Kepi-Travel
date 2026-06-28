import {
  buildTripLegCalendarModel,
  legColorForDate as legColorFromModel,
  STAY_LEG_PALETTE,
  TRAVEL_LEG_COLOR,
  type BuiltTripLeg,
  type DayLegCell as BuiltDayLegCell,
  type TripLegCalendarModel,
} from "@/lib/travelAssistant/buildTripLegs";

export { TRAVEL_LEG_COLOR, STAY_LEG_PALETTE as DESTINATION_LEG_PALETTE };

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

export interface TripLegModel {
  legs: TripLeg[];
  dayCells: Map<string, DayLegCell>;
  legById: Map<string, TripLeg>;
  /** Reservation-based leg model used by calendar + timeline. */
  builtModel: TripLegCalendarModel;
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

function mapLeg(leg: BuiltTripLeg): TripLeg {
  return {
    id: leg.id,
    kind: leg.type === "stay" ? "destination" : "travel",
    label: leg.label,
    color: leg.color,
    startDateKey: leg.startDate,
    endDateKey: leg.endDate,
  };
}

function mapCell(cell: BuiltDayLegCell): DayLegCell {
  return {
    ...cell,
    kind:
      cell.kind === "stay"
        ? "destination"
        : cell.kind === "empty"
          ? "empty"
          : cell.kind,
    position: cell.ribbonPosition,
  };
}

export function buildTripLegModel(args: {
  tripStartDate: string | null;
  tripEndDate: string | null;
  dayNotes: Record<string, string>;
  stopRanges?: unknown[];
  reservations: LegReservation[];
}): TripLegModel {
  void args.dayNotes;
  void args.stopRanges;
  const builtModel = buildTripLegCalendarModel(
    args.reservations,
    args.tripStartDate,
    args.tripEndDate,
  );
  const legs = builtModel.legs.map(mapLeg);
  const legById = new Map<string, TripLeg>();
  for (const leg of legs) legById.set(leg.id, leg);
  const dayCells = new Map<string, DayLegCell>();
  for (const [key, cell] of builtModel.dayCells) {
    dayCells.set(key, mapCell(cell));
  }
  return { legs, dayCells, legById, builtModel };
}

export function legColorForDate(model: TripLegModel, dateKey: string): string | null {
  return legColorFromModel(model.builtModel, dateKey);
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
      return "rounded-l-[12px] rounded-r-none";
    case "last":
      return "rounded-r-[12px] rounded-l-none";
    case "single":
      return "rounded-[12px]";
    default:
      return "rounded-none";
  }
}

export { cellFillStyle } from "@/lib/travelAssistant/buildTripLegs";
