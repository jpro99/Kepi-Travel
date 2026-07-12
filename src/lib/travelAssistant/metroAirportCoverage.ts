import { resolveHotelDestinationSync } from "@/lib/hotels/resolveDestination";
import { citiesLikelySame } from "@/lib/hotels/hotelReservationCity";
import { suggestInterCityRoute } from "@/lib/travelAssistant/interCityTransportSuggestions";
import { airportToCity } from "@/lib/travelAssistant/buildTripLegs";

/** True when a stay city is in the same metro as the arrival airport (e.g. BRI → Polignano). */
export function airportServesStayCity(arrivalIata: string, stayCity: string): boolean {
  const code = arrivalIata.trim().toUpperCase();
  if (code.length !== 3 || !stayCity.trim()) return false;
  const served = resolveHotelDestinationSync(stayCity)?.iata?.trim().toUpperCase();
  return Boolean(served && served === code);
}

/** Short ground hops (e.g. Monopoli ↔ Polignano) where a flight search prompt is noise. */
export function isLocalGroundHop(
  fromLabel: string,
  toLabel: string,
  fromIata = "",
  toIata = "",
): boolean {
  const fromCode = fromIata.trim().toUpperCase();
  const toCode = toIata.trim().toUpperCase();
  // Same airport code serving different towns (VCE → Cortina) is not a zero-distance hop.
  const route =
    fromCode.length === 3 && fromCode === toCode && !citiesLikelySame(fromLabel, toLabel)
      ? suggestInterCityRoute(fromLabel, toLabel, "", "")
      : suggestInterCityRoute(fromLabel, toLabel, fromIata, toIata);
  return route !== null && route.distanceKm < 40;
}

/** Connector from an airport metro to a nearby stay city after an inbound flight. */
export function inboundFlightCoversMetroTransfer(input: {
  fromLabel: string;
  toLabel: string;
  fromIata?: string;
  arrivalIata: string;
}): boolean {
  const arrival = input.arrivalIata.trim().toUpperCase();
  if (arrival.length !== 3) return false;
  if (!airportServesStayCity(arrival, input.toLabel)) return false;

  const fromCode = input.fromIata?.trim().toUpperCase() ?? "";
  if (fromCode && fromCode === arrival) return true;

  const arrivalCity = airportToCity(arrival);
  return citiesLikelySame(input.fromLabel, arrivalCity) || citiesLikelySame(input.fromLabel, arrival);
}
