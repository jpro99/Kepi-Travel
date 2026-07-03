import { resolveAirport } from "@/lib/airports/lookup";
import { HOTEL_CITY_COORDS } from "@/lib/hotels/resolveDestination";

export interface TripFlightHint {
  flightArrivalAirport?: string;
  flightArrivalTime?: string;
  flightDate?: string;
  localTime?: string;
  location?: string;
}

export interface TripHotelHint {
  localTime?: string;
  checkOutDate?: string;
  location?: string;
}

export interface HotelSearchContextInput {
  tripDestination?: string | null;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  flights: TripFlightHint[];
  hotels: TripHotelHint[];
}

export interface HotelSearchContext {
  city: string;
  cityIata: string;
  checkIn: string;
  checkOut: string;
  source: "flight" | "trip" | "hotel" | "default";
}

function isPlaceholderDestination(destination: string | null | undefined): boolean {
  if (!destination?.trim()) return true;
  const normalized = destination.trim().toLowerCase();
  return normalized === "set destination" || normalized === "destination pending";
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatHotelSearchCityLabel(input: string): { label: string; iata: string } {
  const trimmed = input.trim();
  if (!trimmed) return { label: "", iata: "" };

  const upper = trimmed.toUpperCase();
  if (HOTEL_CITY_COORDS[upper]) {
    const hit = HOTEL_CITY_COORDS[upper];
    return { label: `${hit.name} (${upper})`, iata: upper };
  }

  const airport = resolveAirport(trimmed);
  if (airport) {
    const known = HOTEL_CITY_COORDS[airport.iata];
    if (known) {
      return { label: `${known.name} (${airport.iata})`, iata: airport.iata };
    }
    return { label: `${airport.city} (${airport.iata})`, iata: airport.iata };
  }

  const parenMatch = trimmed.match(/\(([A-Z]{3})\)\s*$/);
  if (parenMatch?.[1]) {
    return { label: trimmed, iata: parenMatch[1] };
  }

  return { label: trimmed, iata: "" };
}

/** Infer city + stay dates from the active trip so hotel search works in one tap. */
export function deriveHotelSearchContext(input: HotelSearchContextInput): HotelSearchContext {
  const flights = input.flights;
  const lastFlight = flights.length > 0 ? flights[flights.length - 1] : undefined;
  const firstHotel = input.hotels[0];

  let city = "";
  let cityIata = "";
  let source: HotelSearchContext["source"] = "default";

  if (lastFlight?.flightArrivalAirport?.trim()) {
    const formatted = formatHotelSearchCityLabel(lastFlight.flightArrivalAirport);
    city = formatted.label;
    cityIata = formatted.iata;
    source = "flight";
  } else if (input.tripDestination && !isPlaceholderDestination(input.tripDestination)) {
    const formatted = formatHotelSearchCityLabel(input.tripDestination);
    city = formatted.label;
    cityIata = formatted.iata;
    source = "trip";
  } else if (firstHotel?.location?.trim()) {
    const segment = firstHotel.location.split(",")[0]?.trim() ?? "";
    const formatted = formatHotelSearchCityLabel(segment);
    city = formatted.label || segment;
    cityIata = formatted.iata;
    source = "hotel";
  }

  const arrivalDate =
    isoDate(lastFlight?.flightArrivalTime) ??
    isoDate(lastFlight?.flightDate) ??
    isoDate(lastFlight?.localTime);
  const tripStart = isoDate(input.tripStartDate);
  const tripEnd = isoDate(input.tripEndDate);
  const hotelCheckIn = isoDate(firstHotel?.localTime);
  const hotelCheckOut = isoDate(firstHotel?.checkOutDate);

  const today = todayIso();
  let checkIn = arrivalDate ?? hotelCheckIn ?? tripStart ?? addDays(today, 7);
  if (checkIn < today) {
    checkIn = today;
  }

  let checkOut = hotelCheckOut ?? tripEnd ?? null;
  if (!checkOut || checkOut <= checkIn) {
    checkOut = addDays(checkIn, 3);
  }

  return { city, cityIata, checkIn, checkOut, source };
}
