import type { StopDateRange } from "@/lib/decision/stopDates";
import type { TripStop } from "@/lib/decision/types";
import { normalizeHotelDestinationQuery } from "@/lib/hotels/destinationAliases";
import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import { parseDayIntentFromLines } from "@/lib/travelAssistant/dayPlanLines";
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

/** Canonical key so "Polignano a Mare" and "Polignano Amar" merge. */
export function normalizeStayCityKey(raw: string): string {
  const stripped = raw.replace(/\([A-Z]{3}\)/g, "").trim();
  const normalized = normalizeHotelDestinationQuery(stripped);
  const label = formatHotelSearchCityLabel(normalized.query || stripped).label;
  const base = (label.split("(")[0] ?? label).trim().toLowerCase();
  return base.replace(/\s+/g, " ");
}

export function citiesSame(a: string, b: string): boolean {
  const keyA = normalizeStayCityKey(a);
  const keyB = normalizeStayCityKey(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  return keyA.length >= 5 && keyB.length >= 5 && (keyA.includes(keyB) || keyB.includes(keyA));
}

function canonicalCityName(raw: string): string {
  return enrichStop(raw).name;
}

function extractCityFromNote(text: string): string | null {
  const intent = parseDayIntentFromLines(text);
  if (intent?.stayCity) return intent.stayCity;
  if (intent?.toCity && intent.kind !== "depart") return intent.toCity;
  if (intent?.fromCity && intent.kind === "move") return intent.toCity;

  const inMatch = text.match(/\b(?:in|at|near|around)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{2,40})/iu);
  if (inMatch?.[1]) {
    return inMatch[1].replace(/[.,!?]+$/u, "").trim();
  }

  const beforeDates = text.split(/\b(?:arrive|get there|check[\s-]?in|from|leave|depart|check[\s-]?out)\b/iu)[0]?.trim();
  if (beforeDates && beforeDates.length >= 3 && beforeDates.length <= 48 && !/\d/u.test(beforeDates)) {
    return beforeDates.replace(/[.,!?]+$/u, "").trim();
  }

  return null;
}

function dayOfMonthToIso(yearMonth: string, dayStr: string): string | null {
  const day = Number.parseInt(dayStr, 10);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  const iso = `${yearMonth}-${String(day).padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

/** Parse notes like "Polignano — arrive 2nd, leave 5th" into one stay window. */
export function extractExplicitStayWindows(
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
  dayNotes: Record<string, string>,
): StopDateRange[] {
  const anchor =
    tripStartDate?.slice(0, 10) ??
    Object.keys(dayNotes)
      .filter((key) => dayNotes[key]?.trim())
      .sort()[0];
  if (!anchor) return [];

  const yearMonth = anchor.slice(0, 7);
  const ranges: StopDateRange[] = [];

  for (const note of Object.values(dayNotes)) {
    const text = note.trim();
    if (!text) continue;

    const isoRange = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|–|→|-)\s*(\d{4}-\d{2}-\d{2})/u);
    if (isoRange?.[1] && isoRange[2] && isoRange[2] > isoRange[1]) {
      const city = extractCityFromNote(text);
      if (city) {
        ranges.push({
          stop: enrichStop(city),
          checkIn: isoRange[1],
          checkOut: isoRange[2],
          nights: nightsBetween(isoRange[1], isoRange[2]),
        });
      }
      continue;
    }

    const windowMatch = text.match(
      /(?:arrive|arriving|get(?:\s+there)?|check[\s-]?in)[^.]{0,50}?(\d{1,2})(?:st|nd|rd|th)?[^.]{0,100}?(?:leave|leaving|depart|check[\s-]?out)[^.]{0,50}?(\d{1,2})(?:st|nd|rd|th)?/iu,
    );
    if (windowMatch?.[1] && windowMatch[2]) {
      const checkIn = dayOfMonthToIso(yearMonth, windowMatch[1]);
      const checkOut = dayOfMonthToIso(yearMonth, windowMatch[2]);
      const city = extractCityFromNote(text);
      if (city && checkIn && checkOut && checkOut > checkIn) {
        ranges.push({
          stop: enrichStop(city),
          checkIn,
          checkOut,
          nights: nightsBetween(checkIn, checkOut),
        });
      }
    }
  }

  return mergeStopRanges(ranges);
}

/** Merge overlapping / adjacent stays in the same city into one hotel search block. */
export function mergeStopRanges(ranges: StopDateRange[]): StopDateRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const merged: StopDateRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && citiesSame(last.stop.name, range.stop.name)) {
      const checkOut = range.checkOut > last.checkOut ? range.checkOut : last.checkOut;
      last.checkOut = checkOut;
      last.nights = nightsBetween(last.checkIn, last.checkOut);
      if (!last.stop.iata && range.stop.iata) last.stop.iata = range.stop.iata;
      continue;
    }
    merged.push({
      ...range,
      stop: { ...range.stop },
    });
  }

  return merged;
}

/** Infer city stay ranges from per-day itinerary notes (fallback only). */
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
    const rawCity = resolveStayCityForDayStrict(dayKey, dayNotes);
    if (!rawCity) continue;
    const city = canonicalCityName(rawCity);
    if (!currentCity || !citiesSame(currentCity, city)) {
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

  return mergeStopRanges(ranges);
}

function resolveStayCityForDayStrict(dateKey: string, dayNotes: Record<string, string>): string | null {
  const direct = parseDayIntentFromLines(dayNotes[dateKey] ?? "");
  if (direct?.stayCity) return direct.stayCity;
  if (direct?.toCity && direct.kind === "move") return direct.toCity;
  if (direct?.toCity && (direct.kind === "arrive" || direct.kind === "stay")) return direct.toCity;

  const sortedKeys = Object.keys(dayNotes)
    .filter((key) => key <= dateKey)
    .sort();

  for (let i = sortedKeys.length - 1; i >= 0; i -= 1) {
    const key = sortedKeys[i]!;
    const note = dayNotes[key] ?? "";
    const intent = parseDayIntentFromLines(note);
    if (intent?.stayCity && key <= dateKey) return intent.stayCity;
    if (intent?.toCity && intent.kind === "move" && key === dateKey) return intent.toCity;
    if (intent?.toCity && (intent.kind === "arrive" || intent.kind === "stay") && key <= dateKey) {
      return intent.toCity;
    }
    const inMatch = note.match(/\b(?:in|stay in|staying in)\s+(.+)/iu);
    if (inMatch?.[1] && key <= dateKey) {
      return inMatch[1].replace(/[.,!?]+$/u, "").trim();
    }
  }

  return null;
}

/**
 * Hotel stay blocks — one box per city stay, using dates the user actually planned.
 * Priority: explicit arrive/leave notes → talk-to-plan intent → careful day-note inference.
 */
export function resolveEffectiveStopRanges(
  intentRanges: StopDateRange[],
  tripStartDate: string | null | undefined,
  tripEndDate: string | null | undefined,
  dayNotes: Record<string, string>,
): StopDateRange[] {
  const explicit = mergeStopRanges(
    extractExplicitStayWindows(tripStartDate, tripEndDate, dayNotes),
  );
  if (explicit.length > 0) return explicit;

  if (intentRanges.length > 0) {
    return mergeStopRanges(intentRanges);
  }

  return deriveStopRangesFromDayNotes(tripStartDate, tripEndDate, dayNotes);
}
