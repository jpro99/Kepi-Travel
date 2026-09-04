/**
 * Home today-first stay coach — calendar today + active booked stay win over
 * trip-start replay and remaining-flight headlines (I32 / G49).
 */

import type { StopDateRange } from "@/lib/decision/stopDates";
import { deriveHotelSearchCityFromReservation, citiesLikelySame } from "@/lib/hotels/hotelReservationCity";
import { reservationPropertyName } from "@/lib/travelAssistant/reservationDisplayLabel";
import { isLocalGroundHop } from "@/lib/travelAssistant/metroAirportCoverage";
import type { HomeNextAction } from "@/lib/travelAssistant/homeNextAction";

export interface HomeStayReservation {
  id: string;
  type: string;
  title?: string;
  provider?: string;
  location?: string;
  hotelSearchCity?: string;
  localTime?: string;
  checkOutDate?: string;
  notes?: string;
  timezone?: string;
}

export interface HomeTodayCoach {
  placeCity: string;
  lodgingName: string | null;
  leadTitle: string;
  leadDetail: string | null;
  tomorrowTitle: string | null;
  tomorrowDetail: string | null;
  transferHint: string | null;
  transferHref: string | null;
}

const MS_DAY = 86_400_000;

/** Verified short-hop rail facts — no invented fares or door-to-door times. */
const VERIFIED_RAIL_HOPS: Array<{
  match: (from: string, to: string) => boolean;
  trainMinutes: number;
  distanceKm: number;
  href: string;
}> = [
  {
    // Trenitalia Polignano a Mare ↔ Monopoli Centrale ~5 min direct regional (~8 km).
    match: (from, to) =>
      (/\bpolignano\b/iu.test(from) && /\bmonopoli\b/iu.test(to)) ||
      (/\bmonopoli\b/iu.test(from) && /\bpolignano\b/iu.test(to)),
    trainMinutes: 5,
    distanceKm: 8,
    href: "https://www.trenitalia.com/en.html",
  },
];

export function dateOnly(value: string | null | undefined): string {
  return value?.trim().slice(0, 10) ?? "";
}

export function addIsoDays(dateKey: string, days: number): string {
  const ms = Date.parse(`${dateKey}T12:00:00Z`) + days * MS_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

export function hotelCoversCalendarDay(hotel: HomeStayReservation, dateKey: string): boolean {
  const start = dateOnly(hotel.localTime);
  if (!start) return false;
  const end = dateOnly(hotel.checkOutDate) || start;
  return start <= dateKey && dateKey < end;
}

function stayCityLabel(hotel: HomeStayReservation): string {
  return (
    hotel.hotelSearchCity?.trim() ||
    deriveHotelSearchCityFromReservation(hotel) ||
    hotel.location?.trim() ||
    ""
  );
}

/** Airport metro proxy stays (e.g. "Bari" hotel row) lose to a real town stay on the same night. */
function isAirportMetroProxyCity(city: string): boolean {
  const normalized = city.trim().toLowerCase();
  return normalized === "bari" || normalized === "bari, italy";
}

function resolveStopCityForDay(stopRanges: StopDateRange[], dateKey: string): string | null {
  const range = stopRanges.find((row) => dateKey >= row.checkIn && dateKey < row.checkOut);
  return range?.stop.name?.trim() || null;
}

/**
 * Pick the hotel that actually covers tonight — not the first hotel in storage order.
 * When Bari and Polignano overlap, the stay ending sooner (checkout tomorrow) wins.
 */
export function resolveActiveHotelForDay(
  hotels: HomeStayReservation[],
  dateKey: string,
  stopRanges: StopDateRange[] = [],
): HomeStayReservation | null {
  const booked = hotels.filter(
    (hotel) => hotel.type === "hotel" && hotelCoversCalendarDay(hotel, dateKey),
  );
  if (booked.length === 0) return null;
  if (booked.length === 1) return booked[0]!;

  const stopCity = resolveStopCityForDay(stopRanges, dateKey);

  const scored = booked.map((hotel) => {
    const city = stayCityLabel(hotel);
    let score = 0;
    if (stopCity && city && citiesLikelySame(city, stopCity)) score += 100;
    if (!isAirportMetroProxyCity(city)) score += 50;
    const checkout = dateOnly(hotel.checkOutDate);
    return { hotel, score, checkout };
  });

  scored.sort((a, b) => {
    if (a.checkout && b.checkout && a.checkout !== b.checkout) {
      return a.checkout.localeCompare(b.checkout);
    }
    return b.score - a.score;
  });

  return scored[0]?.hotel ?? null;
}

function resolvePlaceCity(
  hotel: HomeStayReservation | null,
  stopRanges: StopDateRange[],
  dateKey: string,
): string | null {
  if (hotel) {
    const city = stayCityLabel(hotel);
    if (city) return city;
  }
  return resolveStopCityForDay(stopRanges, dateKey);
}

function findNextStayDestination(input: {
  hotels: HomeStayReservation[];
  stopRanges: StopDateRange[];
  afterDateKey: string;
}): { city: string; lodgingName: string | null; hotelId?: string } | null {
  const tomorrow = addIsoDays(input.afterDateKey, 1);

  const nextHotel = input.hotels
    .filter((hotel) => hotel.type === "hotel")
    .filter((hotel) => dateOnly(hotel.localTime) === tomorrow)
    .sort((a, b) => dateOnly(a.localTime).localeCompare(dateOnly(b.localTime)))[0];

  if (nextHotel) {
    return {
      city: stayCityLabel(nextHotel) || reservationPropertyName({ type: "hotel", title: nextHotel.title }),
      lodgingName: reservationPropertyName({
        type: "hotel",
        title: nextHotel.title,
        provider: nextHotel.provider,
        location: nextHotel.location,
        notes: nextHotel.notes,
      }),
      hotelId: nextHotel.id,
    };
  }

  const nextRange = input.stopRanges.find((row) => row.checkIn === tomorrow);
  if (nextRange) {
    return {
      city: nextRange.stop.name,
      lodgingName: null,
    };
  }

  return null;
}

function buildLocalTransferHint(fromCity: string, toCity: string): { hint: string; href: string | null } | null {
  if (!isLocalGroundHop(fromCity, toCity)) return null;

  const verified = VERIFIED_RAIL_HOPS.find((row) => row.match(fromCity, toCity));
  if (verified) {
    return {
      hint: `Best option is a cab, or if you're traveling light, the train (~${verified.trainMinutes} min).`,
      href: verified.href,
    };
  }

  return {
    hint: "It's a short hop — a cab is easiest, or regional rail if you're traveling light.",
    href: "https://www.trenitalia.com/en.html",
  };
}

export function travelerTodayKey(nowMs: number, timezone?: string | null): string {
  const tz = timezone?.trim();
  if (tz) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(nowMs));
    } catch {
      // fall through
    }
  }
  return new Date(nowMs).toISOString().slice(0, 10);
}

export function buildHomeTodayCoach(input: {
  reservations: HomeStayReservation[];
  stopRanges?: StopDateRange[];
  nowMs?: number;
  timezone?: string | null;
}): HomeTodayCoach | null {
  const nowMs = input.nowMs ?? Date.now();
  const stopRanges = input.stopRanges ?? [];
  const hotels = input.reservations.filter((row) => row.type === "hotel");
  const activeHotel = resolveActiveHotelForDay(hotels, travelerTodayKey(nowMs, input.timezone), stopRanges);
  const placeCity = resolvePlaceCity(
    activeHotel,
    stopRanges,
    travelerTodayKey(nowMs, input.timezone),
  );
  if (!placeCity) return null;

  const lodgingName = activeHotel
    ? reservationPropertyName({
        type: "hotel",
        title: activeHotel.title,
        provider: activeHotel.provider,
        location: activeHotel.location,
        notes: activeHotel.notes,
      })
    : null;

  const todayKey = travelerTodayKey(nowMs, input.timezone);
  const checkoutTomorrow =
    activeHotel != null && dateOnly(activeHotel.checkOutDate) === addIsoDays(todayKey, 1);

  let tomorrowTitle: string | null = null;
  let tomorrowDetail: string | null = null;
  let transferHint: string | null = null;
  let transferHref: string | null = null;

  if (checkoutTomorrow) {
    const nextStay = findNextStayDestination({
      hotels,
      stopRanges,
      afterDateKey: todayKey,
    });
    if (nextStay) {
      tomorrowTitle = "Tomorrow";
      tomorrowDetail = nextStay.lodgingName
        ? `Get ready to check out and head to ${nextStay.city} — ${nextStay.lodgingName}.`
        : `Get ready to check out and move to ${nextStay.city}.`;

      const transfer = buildLocalTransferHint(placeCity, nextStay.city);
      if (transfer) {
        transferHint = transfer.hint;
        transferHref = transfer.href;
      }
    } else {
      tomorrowTitle = "Tomorrow";
      tomorrowDetail = `Checkout from ${lodgingName ?? placeCity} — confirm the time with the property.`;
    }
  }

  const leadTitle = `You're in ${placeCity}`;
  const leadDetail = lodgingName && !citiesLikelySame(lodgingName, placeCity) ? lodgingName : null;

  return {
    placeCity,
    lodgingName,
    leadTitle,
    leadDetail,
    tomorrowTitle,
    tomorrowDetail,
    transferHint,
    transferHref,
  };
}

export function homeTodayCoachNextAction(coach: HomeTodayCoach): HomeNextAction {
  if (coach.tomorrowDetail) {
    return {
      kind: coach.transferHref ? "prep" : "ready",
      eyebrow: coach.tomorrowTitle ?? "Tomorrow",
      title: coach.tomorrowDetail,
      detail: coach.transferHint,
      ctaLabel: coach.transferHref ? "Search trains" : "Open Plan",
      prepHref: coach.transferHref ?? undefined,
    };
  }

  return {
    kind: "ready",
    eyebrow: "Today",
    title: coach.leadTitle,
    detail: coach.leadDetail ?? "Enjoy the day — open Plan for notes and bookings.",
    ctaLabel: "Open Plan",
  };
}
