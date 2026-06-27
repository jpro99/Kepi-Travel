import type { StopDateRange } from "@/lib/decision/stopDates";
import type { TripStop } from "@/lib/decision/types";
import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import { resolveStayCityForDay } from "@/lib/travelAssistant/dayPlanLines";
import { buildFullTripDayKeys } from "@/lib/travelAssistant/tripTimelinePlanning";

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`);
  return Math.max(0, Math.round(diff / 86_400_000));
}

function enrichStop(name: string): TripStop {
  const formatted = formatHotelSearchCityLabel(name);
  return {
    name: formatted.label || name,
    iata: formatted.iata || undefined,
  };
}

/** Infer city stay ranges from per-day itinerary notes. */
export function deriveStopRangesFromDayNotes(
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
  dayNotes: Record<string, string>,
): StopDateRange[] {
  const start = tripStartDate?.slice(0, 10);
  const end = tripEndDate?.slice(0, 10);
  if (!start || !end || start > end) return [];

  const hasContent = Object.values(dayNotes).some((note) => note.trim().length > 0);
  if (!hasContent) return [];

  const dayKeys = buildFullTripDayKeys(start, end, []);
  const ranges: StopDateRange[] = [];
  let currentCity: string | null = null;
  let currentCheckIn: string | null = null;

  const flush = (checkOut: string): void => {
    if (!currentCity || !currentCheckIn || checkOut <= currentCheckIn) return;
    ranges.push({
      stop: enrichStop(currentCity),
      checkIn: currentCheckIn,
      checkOut,
      nights: nightsBetween(currentCheckIn, checkOut),
    });
  };

  for (const dayKey of dayKeys) {
    const city = resolveStayCityForDay(dayKey, dayNotes, []);
    if (!city) continue;
    if (city !== currentCity) {
      if (currentCity && currentCheckIn) {
        flush(dayKey);
      }
      currentCity = city;
      currentCheckIn = dayKey;
    }
  }

  if (currentCity && currentCheckIn) {
    flush(addDays(end, 1));
  }

  return ranges;
}

/** Prefer day-note ranges when the user has typed plans; otherwise use talk-to-plan ranges. */
export function resolveEffectiveStopRanges(
  intentRanges: StopDateRange[],
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
  dayNotes: Record<string, string>,
): StopDateRange[] {
  const fromNotes = deriveStopRangesFromDayNotes(tripStartDate, tripEndDate, dayNotes);
  if (fromNotes.length > 0) return fromNotes;
  return intentRanges;
}
