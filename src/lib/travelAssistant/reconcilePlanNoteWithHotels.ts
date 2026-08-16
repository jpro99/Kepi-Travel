import { deriveHotelSearchCityFromReservation } from "@/lib/hotels/hotelReservationCity";
import { citiesLikelySame } from "@/lib/hotels/hotelReservationCity";
import { normalizeDayPlanCity } from "@/lib/travelAssistant/normalizeDayPlanCity";
import {
  mergeDayPlan,
  dayPlanToNote,
  type DayPlanRecord,
} from "@/lib/travelAssistant/itineraryDayPlan";
import { parseDayIntentFromLines, parseDayLines } from "@/lib/travelAssistant/dayPlanLines";
import { parseDayIntent } from "@/lib/travelAssistant/parseDayIntent";
import { buildHotelStaySpans, type HotelStayLegInput } from "@/lib/travelAssistant/hotelAnchoredStayLegs";

export interface ReconcilePlanNoteInput {
  dateKey: string;
  note: string;
  tripStartDate: string;
  tripEndDate: string;
  dayNotes: Record<string, string>;
  dayPlans: Record<string, DayPlanRecord>;
  hotels: HotelStayLegInput[];
  /** Flight-inferred city on this day (e.g. Bari after landing at BRI). */
  inferredStayCity?: string | null;
}

export interface ReconcilePlanNoteResult {
  applied: boolean;
  summary: string | null;
  dayPlans: Record<string, DayPlanRecord>;
  dayNotes: Record<string, string>;
}

function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

function enumerateDays(start: string, end: string): string[] {
  const keys: string[] = [];
  for (let d = start; compareDateKeys(d, end) <= 0; d = addDays(d, 1)) keys.push(d);
  return keys;
}

/**
 * True only for a stay-city correction ("Leave Bari", "not staying in Bari").
 * Activity paste / "test one two three" / a day that mentions Bari must not
 * rewrite the timeline (I52).
 */
export function isStayCityCorrectionNote(note: string): boolean {
  const trimmed = note.trim();
  if (!trimmed) return false;
  if (/^\s*leave\.?\s*$/iu.test(trimmed)) return true;

  const lines = parseDayLines(trimmed);
  if (lines.length > 2) return false;

  if (parseRejectStayCity(trimmed)) return true;

  const intent = lines.length === 1 ? parseDayIntent(lines[0] ?? "") : parseDayIntentFromLines(trimmed);
  if (intent?.kind === "depart") return true;
  if (intent?.kind === "move" && intent.fromCity && intent.toCity) return true;
  return false;
}

/** Detect when the traveler rejects an airport city as their actual stay. */
export function parseRejectStayCity(note: string): string | null {
  const raw = note.trim();
  if (!raw) return null;

  const patterns = [
    /\b(?:not|aren't|are not|isn't|is not|won't|will not)\s+staying\s+(?:in|at)\s+(.+)/iu,
    /\b(?:not|aren't|are not)\s+(?:in|at)\s+(.+)/iu,
    /\bstaying\s+(?:somewhere|elsewhere|another\s+city|a\s+different\s+city)\b/iu,
    /\bwe\s+are\s+staying\s+(?:somewhere|elsewhere)\b/iu,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(raw);
    if (match?.[1]) {
      const city = normalizeDayPlanCity(match[1]);
      if (city.length >= 2) return city;
    }
    if (match && !match[1]) return raw;
  }

  return null;
}

function resolveTargetStayCity(input: ReconcilePlanNoteInput): {
  rejectCity: string | null;
  targetCity: string | null;
  headline: string | null;
} {
  const intent = parseDayIntentFromLines(input.note) ?? parseDayIntent(input.note);
  const rejectFromNote = parseRejectStayCity(input.note);
  const rejectCity =
    rejectFromNote && rejectFromNote.length >= 2
      ? rejectFromNote
      : intent?.fromCity ?? (intent?.kind === "depart" ? input.inferredStayCity ?? null : null);

  if (/^\s*leave\.?\s*$/iu.test(input.note.trim()) && input.inferredStayCity) {
    const hotelSpans = buildHotelStaySpans(input.hotels, input.tripStartDate, input.tripEndDate);
    const different = hotelSpans.find(
      (span) => !citiesLikelySame(span.city, input.inferredStayCity ?? ""),
    );
    if (different) {
      return {
        rejectCity: input.inferredStayCity,
        targetCity: different.city,
        headline: `Got it — staying in ${different.city}, not ${input.inferredStayCity} (from your hotels)`,
      };
    }
  }

  if (intent?.toCity && intent.kind === "move") {
    return {
      rejectCity: intent.fromCity ?? rejectCity,
      targetCity: intent.toCity,
      headline: `Updated plan: stay in ${intent.toCity} (not ${intent.fromCity ?? "airport city"})`,
    };
  }

  if (intent?.stayCity && (intent.kind === "arrive" || intent.kind === "stay")) {
    return {
      rejectCity,
      targetCity: intent.stayCity,
      headline: `Updated plan: stay in ${intent.stayCity}`,
    };
  }

  const hotelSpans = buildHotelStaySpans(input.hotels, input.tripStartDate, input.tripEndDate);
  const upcoming = hotelSpans.filter((span) => compareDateKeys(span.endDate, input.dateKey) >= 0);

  if (rejectCity || intent?.kind === "depart" || /\bleave\b/iu.test(input.note)) {
    const different = upcoming.find((span) => !citiesLikelySame(span.city, rejectCity ?? input.inferredStayCity ?? ""));
    if (different) {
      return {
        rejectCity: rejectCity ?? input.inferredStayCity ?? null,
        targetCity: different.city,
        headline: `Updated plan: you're staying in ${different.city}${rejectCity ? `, not ${rejectCity}` : ""} — matched your hotel bookings`,
      };
    }
  }

  if (rejectCity) {
    const anyHotel = upcoming[0];
    if (anyHotel) {
      return {
        rejectCity,
        targetCity: anyHotel.city,
        headline: `Updated plan: stay in ${anyHotel.city} based on your hotel`,
      };
    }
  }

  return { rejectCity: null, targetCity: null, headline: null };
}

/**
 * When a plan note says "Leave Bari" / "not staying in Bari", align day plans
 * with booked hotels in other cities and propagate forward on the timeline.
 */
export function reconcilePlanNoteWithHotels(input: ReconcilePlanNoteInput): ReconcilePlanNoteResult {
  if (!isStayCityCorrectionNote(input.note)) {
    return {
      applied: false,
      summary: null,
      dayPlans: input.dayPlans,
      dayNotes: input.dayNotes,
    };
  }

  const { targetCity, headline } = resolveTargetStayCity(input);
  if (!targetCity || !headline) {
    return {
      applied: false,
      summary: null,
      dayPlans: input.dayPlans,
      dayNotes: input.dayNotes,
    };
  }

  const hotelSpans = buildHotelStaySpans(input.hotels, input.tripStartDate, input.tripEndDate);
  const dayPlans = { ...input.dayPlans };
  const dayNotes = { ...input.dayNotes, [input.dateKey]: input.note };

  for (const dayKey of enumerateDays(input.dateKey, input.tripEndDate)) {
    const hotelSpan = hotelSpans.find(
      (span) => compareDateKeys(span.startDate, dayKey) <= 0 && compareDateKeys(dayKey, span.endDate) <= 0,
    );
    const location = hotelSpan?.city ?? targetCity;
    const existing = dayPlans[dayKey] ?? mergeDayPlan(undefined, location);
    const hotelOnDay =
      input.hotels.find((h) => {
        if (h.type !== "hotel") return false;
        const start = h.localTime?.slice(0, 10) ?? "";
        const end = h.checkOutDate?.slice(0, 10) ?? start;
        return start <= dayKey && dayKey <= end;
      }) ?? null;

    dayPlans[dayKey] = {
      ...existing,
      location,
      hotelName: hotelOnDay?.title?.trim() || existing.hotelName,
      hotelBooked: Boolean(hotelOnDay) || existing.hotelBooked,
      hotelConfirmation: hotelOnDay?.confirmationCode?.trim() || existing.hotelConfirmation,
      notes: dayKey === input.dateKey ? input.note : existing.notes,
    };
    dayNotes[dayKey] = dayPlanToNote(dayPlans[dayKey]!);
  }

  return {
    applied: true,
    summary: headline,
    dayPlans,
    dayNotes,
  };
}

/** Best hotel city on or after a date — for airport → hotel gaps. */
export function firstHotelCityAfter(
  hotels: HotelStayLegInput[],
  dateKey: string,
  excludeCity?: string | null,
): string | null {
  const spans = hotels
    .filter((h) => h.type === "hotel")
    .map((h) => ({
      city: normalizeDayPlanCity(deriveHotelSearchCityFromReservation(h) ?? ""),
      checkIn: h.localTime?.slice(0, 10) ?? "",
    }))
    .filter((row) => row.city && row.checkIn && row.checkIn >= dateKey)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

  const hit = spans.find((row) => !excludeCity || !citiesLikelySame(row.city, excludeCity));
  return hit?.city ?? null;
}
