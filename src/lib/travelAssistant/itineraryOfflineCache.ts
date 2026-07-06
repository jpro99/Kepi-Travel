/**
 * Shared itinerary-scoped offline cache rules (airport layouts + city map bundles).
 * Prefetch opens 48h before the traveler needs an asset; eviction only when the
 * IATA/city key does not appear in any remaining leg of the same trip.
 */

import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";

export const OFFLINE_PREFETCH_LEAD_HOURS = 48;
export const OFFLINE_PREFETCH_GRACE_AFTER_HOURS = 24;
export const OFFLINE_LEG_GRACE_BEFORE_MS = 6 * 60 * 60 * 1000;

export type OfflineCacheKind = "airport-layout" | "city-map";

export interface ScheduledAirportNeed {
  iata: string;
  needByUtcMs: number;
  role: "departure" | "arrival";
  reservationId: string;
}

export interface ScheduledCityNeed {
  cityKey: string;
  label: string;
  needByUtcMs: number;
  reservationId: string;
}

function parseLocalDateTime(localTime: string, timezone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/u.exec(localTime.trim());
  if (!match) return null;
  const [, year, month, day, hour = "12", minute = "0"] = match;
  const approxUtcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date(approxUtcMs));
    const read = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === type)?.value ?? "0");
    const tzAsUtcMs = Date.UTC(
      read("year"),
      read("month") - 1,
      read("day"),
      read("hour"),
      read("minute"),
    );
    const offsetMs = tzAsUtcMs - approxUtcMs;
    return approxUtcMs - offsetMs;
  } catch {
    return approxUtcMs;
  }
}

function normalizeIata(value: string | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/u.test(code) ? code : null;
}

export function extractScheduledAirportNeeds(
  reservations: SessionReservation[],
): ScheduledAirportNeed[] {
  const needs: ScheduledAirportNeed[] = [];
  for (const reservation of reservations) {
    if (reservation.type !== "flight") continue;
    const dep = normalizeIata(reservation.flightDepartureAirport);
    const arr = normalizeIata(reservation.flightArrivalAirport);
    const depMs = parseLocalDateTime(
      reservation.flightDepartureTime ?? reservation.localTime,
      reservation.timezone,
    );
    const arrMs = parseLocalDateTime(
      reservation.flightArrivalTime ??
        reservation.flightDepartureTime ??
        reservation.localTime,
      reservation.timezone,
    );
    if (dep && depMs !== null) {
      needs.push({
        iata: dep,
        needByUtcMs: depMs,
        role: "departure",
        reservationId: reservation.id,
      });
    }
    if (arr && arrMs !== null && arr !== dep) {
      needs.push({
        iata: arr,
        needByUtcMs: arrMs ?? depMs ?? Date.now(),
        role: "arrival",
        reservationId: reservation.id,
      });
    }
  }
  return needs.sort((left, right) => left.needByUtcMs - right.needByUtcMs);
}

const CITY_ALIASES: Record<string, string> = {
  munich: "munich-de",
  münchen: "munich-de",
  monopoli: "puglia-it",
  polignano: "puglia-it",
  bari: "puglia-it",
  rome: "rome-it",
  roma: "rome-it",
};

export function resolveCityKeyFromLocation(location: string): { cityKey: string; label: string } | null {
  const normalized = location.toLowerCase();
  for (const [needle, cityKey] of Object.entries(CITY_ALIASES)) {
    if (normalized.includes(needle)) {
      return { cityKey, label: needle.charAt(0).toUpperCase() + needle.slice(1) };
    }
  }
  if (/\bitaly\b/iu.test(location)) {
    return { cityKey: "italy-general", label: "Italy" };
  }
  return null;
}

export function extractScheduledCityNeeds(
  reservations: SessionReservation[],
): ScheduledCityNeed[] {
  const needs: ScheduledCityNeed[] = [];
  for (const reservation of reservations) {
    if (reservation.type !== "hotel" && reservation.type !== "dinner") continue;
    const city = resolveCityKeyFromLocation(reservation.location);
    if (!city) continue;
    const needByUtcMs = parseLocalDateTime(reservation.localTime, reservation.timezone);
    if (needByUtcMs === null) continue;
    needs.push({
      cityKey: city.cityKey,
      label: city.label,
      needByUtcMs,
      reservationId: reservation.id,
    });
  }
  return needs.sort((left, right) => left.needByUtcMs - right.needByUtcMs);
}

export function shouldPrefetchAsset(needByUtcMs: number, nowMs: number): boolean {
  const leadMs = OFFLINE_PREFETCH_LEAD_HOURS * 60 * 60 * 1000;
  const graceMs = OFFLINE_PREFETCH_GRACE_AFTER_HOURS * 60 * 60 * 1000;
  return nowMs >= needByUtcMs - leadMs && nowMs <= needByUtcMs + graceMs;
}

export function listRemainingAirportIatas(
  reservations: SessionReservation[],
  nowMs: number,
): Set<string> {
  const cutoff = nowMs - OFFLINE_LEG_GRACE_BEFORE_MS;
  const remaining = new Set<string>();
  for (const need of extractScheduledAirportNeeds(reservations)) {
    if (need.needByUtcMs >= cutoff) {
      remaining.add(need.iata);
    }
  }
  return remaining;
}

export function listRemainingCityKeys(
  reservations: SessionReservation[],
  nowMs: number,
): Set<string> {
  const cutoff = nowMs - OFFLINE_LEG_GRACE_BEFORE_MS;
  const remaining = new Set<string>();
  for (const need of extractScheduledCityNeeds(reservations)) {
    if (need.needByUtcMs >= cutoff) {
      remaining.add(need.cityKey);
    }
  }
  return remaining;
}

export function cacheKeyForAirport(iata: string): string {
  return `airport-layout:${iata.trim().toUpperCase()}`;
}

export function cacheKeyForCity(cityKey: string): string {
  return `city-map:${cityKey.trim().toLowerCase()}`;
}
