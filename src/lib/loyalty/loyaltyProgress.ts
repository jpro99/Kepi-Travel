import { airlineFromProvider } from "@/lib/travelFit/hubKnowledge";
import type { TravelFitReservation } from "@/lib/travelFit/types";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";

const CHAIN_PATTERNS: Array<{ pattern: RegExp; chain: string }> = [
  { pattern: /hyatt/i, chain: "Hyatt" },
  { pattern: /marriott|bonvoy|westin|sheraton|ritz/i, chain: "Marriott" },
  { pattern: /hilton|waldorf|conrad|curio/i, chain: "Hilton" },
  { pattern: /ihg|intercontinental|kimpton|holiday inn/i, chain: "IHG" },
];

function detectHotelChain(hotel: TravelFitReservation): string | null {
  const haystack = `${hotel.provider ?? ""} ${hotel.title ?? ""} ${hotel.location ?? ""}`;
  for (const { pattern, chain } of CHAIN_PATTERNS) {
    if (pattern.test(haystack)) return chain;
  }
  return null;
}

function reservationDateMs(reservation: TravelFitReservation): number | null {
  const iso = reservation.flightDate?.slice(0, 10) ?? reservation.localTime?.slice(0, 10);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return Date.parse(`${iso}T12:00:00Z`);
}

function hotelNights(hotel: TravelFitReservation): number {
  const checkIn = hotel.localTime?.slice(0, 10);
  const checkOut = hotel.checkOutDate?.slice(0, 10);
  if (!checkIn || !checkOut) return 1;
  const start = Date.parse(`${checkIn}T12:00:00Z`);
  const end = Date.parse(`${checkOut}T12:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 1;
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function isInCurrentYear(ms: number, year = new Date().getFullYear()): boolean {
  return new Date(ms).getUTCFullYear() === year;
}

function isAfterBaseline(ms: number, baselineAt?: string): boolean {
  if (!baselineAt?.trim()) return true;
  const baselineMs = Date.parse(baselineAt);
  if (Number.isNaN(baselineMs)) return true;
  return ms >= baselineMs;
}

/** Flight segments Kepi has seen this calendar year (after optional baseline timestamp). */
export function countKepiYtdSegments(
  reservations: TravelFitReservation[],
  airlineCode: string,
  sinceIso?: string,
): number {
  const code = airlineCode.trim().toUpperCase();
  let count = 0;
  for (const reservation of reservations) {
    if (reservation.type !== "flight") continue;
    const flightCode =
      airlineFromProvider(reservation.provider, reservation.title) ??
      reservation.provider?.slice(0, 2).toUpperCase() ??
      "";
    if (flightCode !== code) continue;
    const ms = reservationDateMs(reservation);
    if (ms == null || !isInCurrentYear(ms) || !isAfterBaseline(ms, sinceIso)) continue;
    count += 1;
  }
  return count;
}

/** Qualifying hotel nights Kepi tracked this calendar year for a chain. */
export function countKepiYtdHotelNights(
  reservations: TravelFitReservation[],
  chain: string,
  sinceIso?: string,
): number {
  let nights = 0;
  for (const reservation of reservations) {
    if (reservation.type !== "hotel") continue;
    if (detectHotelChain(reservation) !== chain) continue;
    const ms = reservationDateMs(reservation);
    if (ms == null || !isInCurrentYear(ms) || !isAfterBaseline(ms, sinceIso)) continue;
    nights += hotelNights(reservation);
  }
  return nights;
}

export interface CombinedYtdProgress {
  baseline: number;
  kepiAdded: number;
  total: number;
  hasBaseline: boolean;
}

export function combineYtdProgress(
  balance: Pick<LoyaltyBalance, "segmentsYtd" | "nightsYtd" | "progressBaselineAt"> | undefined,
  kepiAdded: number,
  metric: "segments" | "nights",
): CombinedYtdProgress {
  const rawBaseline = metric === "segments" ? balance?.segmentsYtd : balance?.nightsYtd;
  const hasBaseline = typeof rawBaseline === "number" && Number.isFinite(rawBaseline) && rawBaseline >= 0;
  const baseline = hasBaseline ? Math.round(rawBaseline) : 0;
  return {
    baseline,
    kepiAdded,
    total: baseline + kepiAdded,
    hasBaseline,
  };
}
