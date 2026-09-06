import { deriveHotelSearchCityFromReservation } from "@/lib/hotels/hotelReservationCity";
import { normalizeDayPlanCity } from "@/lib/travelAssistant/normalizeDayPlanCity";

export interface PlanCityOfferReservation {
  type: string;
  title?: string;
  location?: string;
  hotelSearchCity?: string;
  flightArrivalAirport?: string;
  flightDepartureAirport?: string;
}

function uniqueCities(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const label = normalizeDayPlanCity(raw);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/** Derive stay-city offers after a booking import — never invent cities. */
export function derivePlanCityOffersFromReservation(
  reservation: PlanCityOfferReservation,
): string[] {
  if (reservation.type === "hotel") {
    const city =
      reservation.hotelSearchCity?.trim() ||
      deriveHotelSearchCityFromReservation({
        type: "hotel",
        title: reservation.title,
        location: reservation.location,
        hotelSearchCity: reservation.hotelSearchCity,
      }) ||
      reservation.location?.trim() ||
      "";
    return uniqueCities([city]);
  }

  if (reservation.type === "flight") {
    const arrival = reservation.flightArrivalAirport?.trim();
    // Flight arrival IATA alone is not a city label — skip unless location names a city.
    const locationCity = reservation.location?.trim() ?? "";
    return uniqueCities(locationCity ? [locationCity] : arrival ? [] : []);
  }

  const location = reservation.location?.trim() ?? "";
  return uniqueCities(location ? [location] : []);
}

export function derivePlanCityOffersFromReservations(
  reservations: PlanCityOfferReservation[],
): string[] {
  return uniqueCities(reservations.flatMap((row) => derivePlanCityOffersFromReservation(row)));
}
