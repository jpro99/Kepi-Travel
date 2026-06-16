import type { TripIntent, TripStop } from "@/lib/decision/types";

export interface StopDateRange {
  stop: TripStop;
  checkIn: string;
  checkOut: string;
  nights: number;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Assign check-in/out dates to each leg in visit order. */
export function allocateStopDates(intent: TripIntent): StopDateRange[] {
  const stops = intent.stops ?? [];
  if (stops.length === 0) return [];

  const totalNights = Math.max(
    1,
    intent.nights ||
      Math.round(
        (Date.parse(`${intent.endDate}T12:00:00Z`) - Date.parse(`${intent.startDate}T12:00:00Z`)) /
          86_400_000,
      ),
  );

  const withExplicit = stops.map((stop) => stop.nights ?? 0);
  const explicitSum = withExplicit.reduce((a, b) => a + b, 0);
  const unknownCount = stops.filter((s) => !s.nights).length;
  const pool = Math.max(0, totalNights - explicitSum);
  const fallbackNights = unknownCount > 0 ? Math.max(1, Math.floor(pool / unknownCount)) : 0;

  const ranges: StopDateRange[] = [];
  let checkIn = intent.startDate;

  for (let i = 0; i < stops.length; i += 1) {
    const stop = stops[i]!;
    let nights = stop.nights ?? fallbackNights;
    if (i === stops.length - 1) {
      const used = ranges.reduce((sum, r) => sum + r.nights, 0);
      nights = Math.max(1, totalNights - used);
    }
    const checkOut = addDays(checkIn, nights);
    ranges.push({ stop, checkIn, checkOut, nights });
    checkIn = checkOut;
  }

  return ranges;
}

export function formatStopRoute(stops: TripStop[]): string {
  return stops.map((s) => s.name).join(" → ");
}
