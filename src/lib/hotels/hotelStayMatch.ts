import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";

export interface HotelReservationMatchInput {
  id: string;
  title?: string;
  provider?: string;
  location?: string;
  localTime?: string;
  checkOutDate?: string;
  /** City the user searched when saving from Kepi hotel search. */
  hotelSearchCity?: string;
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

function nightsBetween(checkIn: string, checkOut: string): number {
  const diff = Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`);
  return Math.max(0, Math.round(diff / 86_400_000));
}

/** Normalize "Monopoli (BRI), Italy" → "monopoli". */
export function normalizeCityKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withoutParen = trimmed.replace(/\s*\([A-Z]{3}\)\s*/g, " ").trim();
  const stem = withoutParen.split(",")[0]?.trim() ?? withoutParen;
  return stem.toLowerCase();
}

function cityMatchKeys(targetCity: string): string[] {
  const formatted = formatHotelSearchCityLabel(targetCity);
  const keys = new Set<string>();
  for (const candidate of [targetCity, formatted.label, formatted.label.split("(")[0]?.trim() ?? ""]) {
    const key = normalizeCityKey(candidate);
    if (key.length >= 3) keys.add(key);
  }
  if (formatted.iata) keys.add(formatted.iata.toLowerCase());
  return [...keys];
}

function reservationHaystack(hotel: HotelReservationMatchInput): string {
  return `${hotel.hotelSearchCity ?? ""} ${hotel.location ?? ""} ${hotel.title ?? ""} ${hotel.provider ?? ""}`.toLowerCase();
}

/** True when a saved hotel belongs to the target city/region. */
export function hotelReservationMatchesCity(
  hotel: HotelReservationMatchInput,
  targetCity: string,
): boolean {
  if (!targetCity.trim()) return false;

  const haystack = reservationHaystack(hotel);
  if (!haystack.trim()) return false;

  if (hotel.hotelSearchCity?.trim()) {
    const savedKeys = cityMatchKeys(hotel.hotelSearchCity);
    const targetKeys = cityMatchKeys(targetCity);
    if (savedKeys.some((saved) => targetKeys.some((target) => saved === target || saved.includes(target) || target.includes(saved)))) {
      return true;
    }
  }

  return cityMatchKeys(targetCity).some((key) => haystack.includes(key));
}

export function hotelReservationOverlapsStay(
  hotel: HotelReservationMatchInput,
  segmentCheckIn: string,
  segmentCheckOut: string,
): boolean {
  const checkIn = isoDate(hotel.localTime);
  const checkOut = hotelCheckout(hotel) ?? (checkIn ? addDays(checkIn, 1) : null);
  if (!checkIn || !checkOut) return true;
  return checkIn < segmentCheckOut && checkOut > segmentCheckIn;
}

function hotelCheckout(hotel: HotelReservationMatchInput): string | null {
  return isoDate(hotel.checkOutDate);
}

export type SegmentHotelBookingStatus = "missing" | "booked" | "partial";

export function resolveHotelForStaySegment(
  segment: { city: string; checkIn: string; checkOut: string },
  hotels: HotelReservationMatchInput[],
): {
  status: SegmentHotelBookingStatus;
  reservationId?: string;
  reservationTitle?: string;
} {
  let best: {
    status: SegmentHotelBookingStatus;
    reservationId?: string;
    reservationTitle?: string;
    overlapNights: number;
  } | null = null;

  for (const hotel of hotels) {
    if (!hotelReservationMatchesCity(hotel, segment.city)) continue;

    const checkIn = isoDate(hotel.localTime);
    const checkOut = hotelCheckout(hotel) ?? (checkIn ? addDays(checkIn, 1) : null);
    if (!checkIn || !checkOut) {
      return {
        status: "booked",
        reservationId: hotel.id,
        reservationTitle: hotel.title ?? hotel.provider ?? "Hotel",
      };
    }

    const overlaps = checkIn < segment.checkOut && checkOut > segment.checkIn;
    if (!overlaps) continue;

    const overlapStart = checkIn > segment.checkIn ? checkIn : segment.checkIn;
    const overlapEnd = checkOut < segment.checkOut ? checkOut : segment.checkOut;
    const overlapNights = nightsBetween(overlapStart, overlapEnd);
    if (overlapNights <= 0) continue;

    const fullyCovers = checkIn <= segment.checkIn && checkOut >= segment.checkOut;
    const status: SegmentHotelBookingStatus = fullyCovers ? "booked" : "partial";
    const rank = fullyCovers ? 10_000 + overlapNights : overlapNights;

    if (!best || rank > (best.status === "booked" ? 10_000 + best.overlapNights : best.overlapNights)) {
      best = {
        status,
        reservationId: hotel.id,
        reservationTitle: hotel.title ?? hotel.provider ?? "Hotel",
        overlapNights,
      };
    }
  }

  if (!best) return { status: "missing" };

  // Any overlapping hotel in the right city counts as booked for UX — user already picked one.
  return {
    status: "booked",
    reservationId: best.reservationId,
    reservationTitle: best.reservationTitle,
  };
}
