import { detectTripGaps } from "@/lib/travelAssistant/gapDetectionService";
import { parseDayIntentFromLines, resolveStayCityForDay } from "@/lib/travelAssistant/dayPlanLines";
import type { StopDateRange } from "@/lib/decision/stopDates";

export type ItineraryDayStatus = "empty" | "complete" | "action" | "problem";

type ReservationSlice = {
  id: string;
  type: string;
  localTime: string;
  flightDate?: string;
  checkOutDate?: string;
  location?: string;
  provider?: string;
};

function reservationOnDay(reservation: ReservationSlice, dateKey: string): boolean {
  if (reservation.type === "flight" && reservation.flightDate) {
    return reservation.flightDate.slice(0, 10) === dateKey;
  }
  const start = reservation.localTime.trim().slice(0, 10);
  if (start === dateKey) return true;
  const end = reservation.checkOutDate?.slice(0, 10);
  if (end && start <= dateKey && dateKey <= end) return true;
  return false;
}

function hotelOnDay(reservations: ReservationSlice[], dateKey: string): boolean {
  return reservations.some((r) => r.type === "hotel" && reservationOnDay(r, dateKey));
}

export function computeItineraryDayStatus(args: {
  dateKey: string;
  dayNotes: Record<string, string>;
  stopRanges: StopDateRange[];
  tripStartDate: string | null;
  tripEndDate: string | null;
  reservations: ReservationSlice[];
  gapDateKeys?: Set<string>;
}): ItineraryDayStatus {
  const { dateKey, dayNotes, stopRanges, tripStartDate, tripEndDate, reservations } = args;
  const dayReservations = reservations.filter((r) => reservationOnDay(r, dateKey));
  const note = dayNotes[dateKey]?.trim() ?? "";
  const intent = note ? parseDayIntentFromLines(note) : null;
  const stayCity = resolveStayCityForDay(dateKey, dayNotes, stopRanges, tripStartDate, tripEndDate);

  if (args.gapDateKeys?.has(dateKey)) return "problem";

  const hasPlan = Boolean(note);
  const hasBooking = dayReservations.length > 0;
  const needsHotel =
    Boolean(stayCity || intent?.needsHotelCheckin) &&
    !hotelOnDay(reservations, dateKey) &&
    Boolean(stayCity);

  if (needsHotel && (hasPlan || stayCity)) return "action";
  if (hasBooking && (hasPlan || stayCity || dayReservations.some((r) => r.type === "flight"))) {
    return "complete";
  }
  if (hasBooking) return "complete";
  if (hasPlan) return "action";
  return "empty";
}

export function buildGapDateKeys(
  reservations: Parameters<typeof detectTripGaps>[0],
): Set<string> {
  const keys = new Set<string>();
  for (const gap of detectTripGaps(reservations)) {
    if (gap.severity !== "critical" && gap.severity !== "warning") continue;
    const match = gap.detail.match(/\d{4}-\d{2}-\d{2}/);
    if (match?.[0]) keys.add(match[0]);
  }
  return keys;
}

export function dayStatusDotClass(status: ItineraryDayStatus): string {
  switch (status) {
    case "complete":
      return "bg-emerald-500 ring-emerald-500/30";
    case "action":
      return "bg-amber-500 ring-amber-500/30";
    case "problem":
      return "bg-red-500 ring-red-500/30";
    default:
      return "bg-slate-300 ring-slate-300/30 dark:bg-slate-600 dark:ring-slate-600/30";
  }
}
