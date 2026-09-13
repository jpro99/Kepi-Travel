/**
 * G64 — Honest post-arrival / left-aircraft detection for Home coach.
 * Mid-stay and calendar days after landing must never lead with deplane copy.
 */

import { citiesLikelySame } from "@/lib/hotels/hotelReservationCity";
import { timezoneForIata } from "@/lib/airports/lookup";
import { toUtcMs } from "@/lib/travelAssistant/journeyPhase";
import {
  dateOnly,
  hotelCoversCalendarDay,
  resolveActiveHotelForDay,
  travelerTodayKey,
  type HomeStayReservation,
} from "@/lib/travelAssistant/homeTodayCoach";
import { flightDepartureUtcMs } from "@/lib/travelAssistant/flightSort";

const MS_PER_MIN = 60_000;

/** Matches `formatTravelDayArrivalLabel` — VCE reads as Venice (G55). */
function arrivalMetroLabel(arrivalAirport?: string | null): string {
  const iata = arrivalAirport?.trim().toUpperCase() ?? "";
  if (iata === "VCE") return "Venice";
  return iata || "destination";
}

/** After scheduled arrival, stop Home arrival/deplane coach (Europe/Rome local clock). */
export const POST_ARRIVAL_COACH_GRACE_MS = 30 * MS_PER_MIN;

export interface PostArrivalFlightFields {
  flightArrivalTime?: string | null;
  flightArrivalAirport?: string | null;
  flightDepartureTime?: string | null;
  localTime?: string | null;
  timezone?: string | null;
}

export function flightArrivalUtcMsHonest(flight: PostArrivalFlightFields): number {
  const arrivalLocal = flight.flightArrivalTime?.trim();
  if (!arrivalLocal) return Number.NaN;
  const arrivalTz = timezoneForIata(flight.flightArrivalAirport ?? "") ?? flight.timezone ?? undefined;
  const ms = toUtcMs(arrivalLocal, arrivalTz);
  if (Number.isNaN(ms)) return Number.NaN;
  const depMs = flightDepartureUtcMs({
    localTime: flight.localTime ?? undefined,
    timezone: flight.timezone ?? undefined,
    flightDepartureTime: flight.flightDepartureTime ?? undefined,
  });
  if (!Number.isNaN(depMs) && ms <= depMs) return Number.NaN;
  return ms;
}

export function minutesSinceScheduledArrival(
  flight: PostArrivalFlightFields,
  nowMs: number,
): number | null {
  const arrMs = flightArrivalUtcMsHonest(flight);
  if (Number.isNaN(arrMs)) return null;
  return Math.max(0, Math.round((nowMs - arrMs) / MS_PER_MIN));
}

export function arrivalCalendarDayKey(
  flight: PostArrivalFlightFields,
  timezone?: string | null,
): string | null {
  const arrivalLocal = flight.flightArrivalTime?.trim();
  if (!arrivalLocal) return null;
  const arrMs = flightArrivalUtcMsHonest(flight);
  if (!Number.isNaN(arrMs)) {
    const arrivalTz =
      timezone ??
      timezoneForIata(flight.flightArrivalAirport ?? "") ??
      flight.timezone ??
      null;
    return travelerTodayKey(arrMs, arrivalTz);
  }
  return dateOnly(arrivalLocal);
}

/** Booked stay covering today at the arrival metro (e.g. VCE → Venice Airbnb). */
export function hasActiveMidStayAtArrival(input: {
  flight: PostArrivalFlightFields;
  hotels: readonly HomeStayReservation[];
  nowMs?: number;
  timezone?: string | null;
  stopRanges?: import("@/lib/decision/stopDates").StopDateRange[];
}): boolean {
  const nowMs = input.nowMs ?? Date.now();
  const tz = input.timezone ?? input.flight.timezone ?? null;
  const todayKey = travelerTodayKey(nowMs, tz);
  const arrivalDay = arrivalCalendarDayKey(input.flight, tz);
  if (arrivalDay && todayKey > arrivalDay) return true;

  const activeHotel = resolveActiveHotelForDay(
    input.hotels.filter((row) => row.type === "hotel"),
    todayKey,
    input.stopRanges ?? [],
  );
  if (!activeHotel) return false;

  const arrivalCity = arrivalMetroLabel(input.flight.flightArrivalAirport);
  const stayCity =
    activeHotel.hotelSearchCity?.trim() ||
    activeHotel.location?.trim() ||
    "";
  if (!stayCity || !arrivalCity) return false;
  return citiesLikelySame(stayCity, arrivalCity);
}

export function hasTravelerLeftAircraft(
  flight: PostArrivalFlightFields,
  nowMs: number,
  options?: {
    graceMs?: number;
    locationStatus?: string | null;
  },
): boolean {
  const graceMs = options?.graceMs ?? POST_ARRIVAL_COACH_GRACE_MS;
  const arrMs = flightArrivalUtcMsHonest(flight);
  if (!Number.isNaN(arrMs) && nowMs >= arrMs + graceMs) return true;

  const landedMinutes = minutesSinceScheduledArrival(flight, nowMs);
  if (landedMinutes != null && landedMinutes >= graceMs / MS_PER_MIN) return true;

  if (options?.locationStatus === "away" && landedMinutes != null && landedMinutes >= 20) {
    return true;
  }

  return false;
}

export function shouldSuppressHomeArrivalCoach(input: {
  flight: PostArrivalFlightFields | null | undefined;
  hotels?: readonly HomeStayReservation[];
  nowMs?: number;
  timezone?: string | null;
  locationStatus?: string | null;
  landedMinutesAgo?: number | null;
  stopRanges?: import("@/lib/decision/stopDates").StopDateRange[];
}): boolean {
  if (!input.flight) return false;
  const nowMs = input.nowMs ?? Date.now();

  if (
    hasActiveMidStayAtArrival({
      flight: input.flight,
      hotels: input.hotels ?? [],
      nowMs,
      timezone: input.timezone,
      stopRanges: input.stopRanges,
    })
  ) {
    return true;
  }

  if (hasTravelerLeftAircraft(input.flight, nowMs, { locationStatus: input.locationStatus })) {
    return true;
  }

  const landed =
    input.landedMinutesAgo ??
    minutesSinceScheduledArrival(input.flight, nowMs);
  if (landed != null && landed >= POST_ARRIVAL_COACH_GRACE_MS / MS_PER_MIN) {
    return true;
  }

  return false;
}

/** Regression helper — deplane / leave-plane Home copy must never return mid-stay. */
export function isArrivalDeplaneCoachCopy(text: string): boolean {
  return /leave\s+(the\s+)?plane|leave aircraft|→\s*arrivals|deplane/i.test(text);
}

export function hotelCoversMidStayNight(
  hotel: HomeStayReservation,
  dateKey: string,
): boolean {
  return hotel.type === "hotel" && hotelCoversCalendarDay(hotel, dateKey);
}
