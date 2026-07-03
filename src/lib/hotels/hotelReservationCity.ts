import type { HotelReservationMatchInput } from "@/lib/hotels/hotelStayMatch";

function normalizeCityKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const withoutParen = trimmed.replace(/\s*\([A-Z]{3}\)\s*/g, " ").trim();
  const stem = withoutParen.split(",")[0]?.trim() ?? withoutParen;
  return stem.toLowerCase();
}

/** Best-effort city label for matching saved hotels to planned stays. */
export function deriveHotelSearchCityFromReservation(
  hotel: HotelReservationMatchInput,
): string | undefined {
  if (hotel.hotelSearchCity?.trim()) return hotel.hotelSearchCity.trim();

  const location = hotel.location?.trim();
  if (location) {
    const parts = location.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const maybeCountry = parts[parts.length - 1]?.toLowerCase() ?? "";
      if (/^(italy|italia|it|usa|us|france|spain|uk)$/i.test(maybeCountry)) {
        return parts[parts.length - 2];
      }
      return parts[parts.length - 1];
    }
    const single = parts[0];
    if (single && !looksLikeStreetAddress(single)) return single;
  }

  const title = hotel.title?.trim();
  if (title) {
    const words = title.split(/\s+/);
    const last = words[words.length - 1];
    if (last && last.length >= 4 && /^[A-Za-z]/.test(last)) return last;
  }

  return undefined;
}

function looksLikeStreetAddress(value: string): boolean {
  return /^(via|viale|piazza|corso|str\.|street|st\.|ave|avenue|road|rd\.|blvd|boulevard|drive|dr\.|lane|ln\.|\d)/i.test(
    value.trim(),
  );
}

export function enrichHotelReservationForMatching(
  hotel: HotelReservationMatchInput,
): HotelReservationMatchInput {
  const derived = deriveHotelSearchCityFromReservation(hotel);
  if (!derived || hotel.hotelSearchCity?.trim()) return hotel;
  return { ...hotel, hotelSearchCity: derived };
}

export function reservationLooksBooked(hotel: HotelReservationMatchInput & { confirmationCode?: string; notes?: string }): boolean {
  if (hotel.confirmationCode?.trim()) return true;
  const notes = hotel.notes?.toLowerCase() ?? "";
  return notes.includes("booked via kepi") || notes.includes("confirmation");
}

/** When trip has one stay city and one hotel, treat as a match even if city strings differ slightly. */
export function singleStayHotelFallback(
  hotels: HotelReservationMatchInput[],
  stayCityCount: number,
): HotelReservationMatchInput | null {
  if (stayCityCount !== 1 || hotels.length !== 1) return null;
  return hotels[0] ?? null;
}

export function citiesLikelySame(a: string, b: string): boolean {
  const keyA = normalizeCityKey(a);
  const keyB = normalizeCityKey(b);
  if (!keyA || !keyB) return false;
  return keyA === keyB || keyA.includes(keyB) || keyB.includes(keyA);
}
