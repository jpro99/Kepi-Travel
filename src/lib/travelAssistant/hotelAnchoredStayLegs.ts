import { deriveHotelSearchCityFromReservation } from "@/lib/hotels/hotelReservationCity";
import { normalizeDayPlanCity } from "@/lib/travelAssistant/normalizeDayPlanCity";
import type { BuiltTripLeg } from "@/lib/travelAssistant/buildTripLegs";
import type { DayPlanRecord } from "@/lib/travelAssistant/itineraryDayPlan";
import { buildDayStayTimeline } from "@/lib/travelAssistant/dayStayTimeline";

export interface HotelStayLegInput {
  id: string;
  type: string;
  title?: string;
  provider?: string;
  location?: string;
  localTime?: string;
  checkOutDate?: string;
  confirmationCode?: string | null;
}

export interface HotelStaySpan {
  city: string;
  startDate: string;
  endDate: string;
  hotelId: string;
  hotelTitle: string;
}

function isoDate(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const slice = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

function cityKey(value: string): string {
  return normalizeDayPlanCity(value).toLowerCase();
}

function isBookedHotel(hotel: HotelStayLegInput): boolean {
  const code = hotel.confirmationCode?.trim().toUpperCase() ?? "";
  if (code === "PLANNED" || code === "LOCAL") return false;
  if (code) return true;
  const title = hotel.title?.trim() ?? "";
  return title.length > 2 && !/^hotel$/i.test(title);
}

/** Booked hotel reservations → contiguous city stay spans (hotels win over flight arrival cities). */
export function buildHotelStaySpans(
  hotels: HotelStayLegInput[],
  tripStart: string,
  tripEnd: string,
): HotelStaySpan[] {
  const spans: HotelStaySpan[] = [];

  for (const hotel of hotels) {
    if (hotel.type !== "hotel" || !isBookedHotel(hotel)) continue;
    const checkIn = isoDate(hotel.localTime);
    if (!checkIn) continue;
    let checkOut = isoDate(hotel.checkOutDate) ?? checkIn;
    if (checkOut < checkIn) checkOut = checkIn;
    if (checkIn > tripEnd || checkOut < tripStart) continue;

    const startDate = compareDateKeys(checkIn, tripStart) < 0 ? tripStart : checkIn;
    const endDate = compareDateKeys(checkOut, tripEnd) > 0 ? tripEnd : checkOut;
    const city =
      normalizeDayPlanCity(
        deriveHotelSearchCityFromReservation(hotel) ??
          hotel.location?.split(",").map((p) => p.trim()).filter(Boolean).slice(-2)[0] ??
          hotel.title ??
          "",
      ) || "Stay";
    const hotelTitle = hotel.title?.trim() || hotel.provider?.trim() || "Hotel";

    spans.push({ city, startDate, endDate, hotelId: hotel.id, hotelTitle });
  }

  spans.sort((a, b) => compareDateKeys(a.startDate, b.startDate));

  const merged: HotelStaySpan[] = [];
  for (const span of spans) {
    const prev = merged[merged.length - 1];
    if (prev && cityKey(prev.city) === cityKey(span.city) && compareDateKeys(addDays(prev.endDate, 1), span.startDate) >= 0) {
      prev.endDate = compareDateKeys(prev.endDate, span.endDate) >= 0 ? prev.endDate : span.endDate;
      continue;
    }
    merged.push({ ...span });
  }

  return merged;
}

export interface OverlayHotelStaysInput {
  legs: BuiltTripLeg[];
  hotels: HotelStayLegInput[];
  tripStart: string;
  tripEnd: string;
  dayNotes?: Record<string, string>;
  dayPlans?: Record<string, DayPlanRecord>;
  stayColorForCity: (city: string, index: number) => string;
}

/** Replace flight-inferred stay blocks with hotel cities when bookings exist. */
export function overlayHotelAnchoredStays(input: OverlayHotelStaysInput): BuiltTripLeg[] {
  const hotelSpans = buildHotelStaySpans(input.hotels, input.tripStart, input.tripEnd);
  const noteSpans = buildNoteAnchoredSpans(
    input.tripStart,
    input.tripEnd,
    input.dayNotes ?? {},
    input.dayPlans ?? {},
  );

  const anchors = mergeStaySpans(hotelSpans, noteSpans);
  if (anchors.length === 0) return input.legs;

  const travelLegs = input.legs.filter((leg) => leg.type === "travel");
  let colorIndex = 0;
  const stayLegs: BuiltTripLeg[] = anchors.map((span, index) => ({
    id: `leg-stay-anchor-${span.hotelId || span.city}-${index}`,
    type: "stay",
    label: span.city,
    startDate: span.startDate,
    endDate: span.endDate,
    color: input.stayColorForCity(span.city, colorIndex++),
  }));

  const combined = [...travelLegs, ...stayLegs].sort((a, b) => compareDateKeys(a.startDate, b.startDate));
  return combined;
}

function buildNoteAnchoredSpans(
  tripStart: string,
  tripEnd: string,
  dayNotes: Record<string, string>,
  dayPlans: Record<string, DayPlanRecord>,
): HotelStaySpan[] {
  const timeline = buildDayStayTimeline(tripStart, tripEnd, dayNotes, []);
  const spans: HotelStaySpan[] = [];
  let current: HotelStaySpan | null = null;

  const dayKeys = [...timeline.keys()].sort();
  for (const dayKey of dayKeys) {
    const planCity = dayPlans[dayKey]?.location?.trim();
    const snapshot = timeline.get(dayKey);
    const city = normalizeDayPlanCity(planCity || snapshot?.stayCity || "");
    if (!city) {
      if (current) {
        spans.push(current);
        current = null;
      }
      continue;
    }

    if (current && cityKey(current.city) === cityKey(city) && compareDateKeys(addDays(current.endDate, 1), dayKey) >= 0) {
      current.endDate = dayKey;
      continue;
    }

    if (current) spans.push(current);
    current = {
      city,
      startDate: dayKey,
      endDate: dayKey,
      hotelId: `note-${dayKey}`,
      hotelTitle: city,
    };
  }
  if (current) spans.push(current);
  return spans;
}

function mergeStaySpans(hotelSpans: HotelStaySpan[], noteSpans: HotelStaySpan[]): HotelStaySpan[] {
  if (hotelSpans.length === 0) return noteSpans;
  if (noteSpans.length === 0) return hotelSpans;

  const byDate = new Map<string, HotelStaySpan>();
  for (const span of hotelSpans) {
    for (let d = span.startDate; compareDateKeys(d, span.endDate) <= 0; d = addDays(d, 1)) {
      byDate.set(d, span);
    }
  }
  for (const span of noteSpans) {
    for (let d = span.startDate; compareDateKeys(d, span.endDate) <= 0; d = addDays(d, 1)) {
      if (!byDate.has(d)) byDate.set(d, span);
    }
  }

  const sortedDays = [...byDate.keys()].sort();
  const merged: HotelStaySpan[] = [];
  let current: HotelStaySpan | null = null;

  for (const day of sortedDays) {
    const span = byDate.get(day)!;
    if (current && cityKey(current.city) === cityKey(span.city) && compareDateKeys(addDays(current.endDate, 1), day) >= 0) {
      current.endDate = day;
      continue;
    }
    if (current) merged.push(current);
    current = { ...span, startDate: day, endDate: day };
  }
  if (current) merged.push(current);
  return merged;
}
