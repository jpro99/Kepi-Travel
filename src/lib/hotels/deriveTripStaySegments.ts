import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import { resolveHotelDestination } from "@/lib/hotels/resolveDestination";

export type TripStaySegmentStatus = "missing" | "booked" | "partial";

export interface TripStaySegmentInput {
  id: string;
  city: string;
  cityIata?: string;
  checkIn: string;
  checkOut: string;
  source: "flight" | "trip" | "manual" | "gap";
}

export interface TripStaySegment extends TripStaySegmentInput {
  nights: number;
  status: TripStaySegmentStatus;
  reservationId?: string;
  reservationTitle?: string;
  label: string;
}

export interface DeriveTripStaySegmentsInput {
  tripDestination?: string | null;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  flights: Array<{
    id: string;
    flightArrivalAirport?: string;
    flightDepartureAirport?: string;
    flightArrivalTime?: string;
    flightDepartureTime?: string;
    flightDate?: string;
    localTime?: string;
  }>;
  hotels: Array<{
    id: string;
    title?: string;
    provider?: string;
    location?: string;
    localTime?: string;
    checkOutDate?: string;
  }>;
  manualSegments?: TripStaySegmentInput[];
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
  return Math.max(1, Math.round(diff / 86_400_000));
}

function flightDay(f: DeriveTripStaySegmentsInput["flights"][0], kind: "arrival" | "departure"): string | null {
  if (kind === "arrival") {
    return isoDate(f.flightArrivalTime) ?? isoDate(f.flightDate) ?? isoDate(f.localTime);
  }
  return isoDate(f.flightDepartureTime) ?? isoDate(f.flightDate) ?? isoDate(f.localTime);
}

function hotelCheckout(h: DeriveTripStaySegmentsInput["hotels"][0]): string | null {
  return isoDate(h.checkOutDate);
}

function locationHaystack(h: DeriveTripStaySegmentsInput["hotels"][0]): string {
  return `${h.location ?? ""} ${h.title ?? ""} ${h.provider ?? ""}`.toLowerCase();
}

function cityMatchesHotel(city: string, hotel: DeriveTripStaySegmentsInput["hotels"][0]): boolean {
  const cityLower = city.toLowerCase();
  const stem = cityLower.split(",")[0]?.trim() ?? cityLower;
  const haystack = locationHaystack(hotel);
  return haystack.includes(stem) || (stem.length >= 4 && haystack.includes(stem.slice(0, 4)));
}

function segmentStatus(
  segment: TripStaySegmentInput,
  hotels: DeriveTripStaySegmentsInput["hotels"],
): Pick<TripStaySegment, "status" | "reservationId" | "reservationTitle"> {
  for (const hotel of hotels) {
    const checkIn = isoDate(hotel.localTime);
    const checkOut = hotelCheckout(hotel) ?? (checkIn ? addDays(checkIn, 1) : null);
    if (!checkIn || !checkOut) continue;
    if (!cityMatchesHotel(segment.city, hotel)) continue;

    const coversStart = checkIn <= segment.checkIn && checkOut > segment.checkIn;
    const coversEnd = checkIn < segment.checkOut && checkOut >= segment.checkOut;
    const fullyCovers = checkIn <= segment.checkIn && checkOut >= segment.checkOut;

    if (fullyCovers) {
      return {
        status: "booked",
        reservationId: hotel.id,
        reservationTitle: hotel.title ?? hotel.provider ?? "Hotel",
      };
    }
    if (coversStart || coversEnd) {
      return {
        status: "partial",
        reservationId: hotel.id,
        reservationTitle: hotel.title ?? hotel.provider ?? "Hotel",
      };
    }
  }
  return { status: "missing" };
}

function buildSegmentLabel(city: string, checkIn: string, checkOut: string, nights: number): string {
  return `${city} · ${checkIn} → ${checkOut} (${nights} night${nights === 1 ? "" : "s"})`;
}

/** Break a trip into city stay segments for guided hotel search. */
export function deriveTripStaySegments(input: DeriveTripStaySegmentsInput): TripStaySegment[] {
  const manual = input.manualSegments ?? [];
  const tripStart = isoDate(input.tripStartDate);
  const tripEnd = isoDate(input.tripEndDate);
  const today = new Date().toISOString().slice(0, 10);

  const rawSegments: TripStaySegmentInput[] = [...manual];

  const sortedFlights = [...input.flights].sort((a, b) => {
    const aDay = flightDay(a, "arrival") ?? flightDay(a, "departure") ?? "";
    const bDay = flightDay(b, "arrival") ?? flightDay(b, "departure") ?? "";
    return aDay.localeCompare(bDay);
  });

  for (let index = 0; index < sortedFlights.length; index++) {
    const flight = sortedFlights[index];
    const arrivalDay = flightDay(flight, "arrival");
    const arrivalAirport = flight.flightArrivalAirport?.trim();
    if (!arrivalDay || !arrivalAirport) continue;

    const formatted = formatHotelSearchCityLabel(arrivalAirport);
    const nextFlight = sortedFlights[index + 1];
    const nextDepartureDay = nextFlight ? flightDay(nextFlight, "departure") : null;

    let checkIn = arrivalDay;
    if (tripStart && checkIn < tripStart) checkIn = tripStart;
    if (checkIn < today) checkIn = today;

    let checkOut = nextDepartureDay ?? tripEnd ?? addDays(checkIn, 3);
    if (checkOut <= checkIn) checkOut = addDays(checkIn, 3);
    if (tripEnd && checkOut > tripEnd) checkOut = tripEnd;

    rawSegments.push({
      id: `flight-${flight.id}-${index}`,
      city: formatted.label || arrivalAirport,
      cityIata: formatted.iata || undefined,
      checkIn,
      checkOut,
      source: "flight",
    });
  }

  if (rawSegments.length === 0 && input.tripDestination?.trim()) {
    const formatted = formatHotelSearchCityLabel(input.tripDestination);
    const checkIn = tripStart && tripStart >= today ? tripStart : addDays(today, 7);
    let checkOut = tripEnd ?? addDays(checkIn, 3);
    if (checkOut <= checkIn) checkOut = addDays(checkIn, 3);
    rawSegments.push({
      id: "trip-destination",
      city: formatted.label || input.tripDestination.trim(),
      cityIata: formatted.iata || undefined,
      checkIn,
      checkOut,
      source: "trip",
    });
  }

  const deduped = rawSegments.filter(
    (segment, idx, arr) =>
      arr.findIndex(
        (other) =>
          other.city.toLowerCase() === segment.city.toLowerCase() &&
          other.checkIn === segment.checkIn &&
          other.checkOut === segment.checkOut,
      ) === idx,
  );

  return deduped
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .map((segment) => {
      const nights = nightsBetween(segment.checkIn, segment.checkOut);
      const booking = segmentStatus(segment, input.hotels);
      const cityLabel = segment.city.split("(")[0]?.trim() || segment.city;
      return {
        ...segment,
        nights,
        label: buildSegmentLabel(cityLabel, segment.checkIn, segment.checkOut, nights),
        ...booking,
      };
    });
}

/** First segment that still needs a hotel — used for "Search next stay" CTA. */
export function nextMissingStaySegment(segments: TripStaySegment[]): TripStaySegment | null {
  return segments.find((segment) => segment.status === "missing" || segment.status === "partial") ?? null;
}

/** Async helper to enrich manual city names with display labels. */
export async function normalizeManualStayCity(raw: string): Promise<{ city: string; cityIata: string }> {
  const resolved = await resolveHotelDestination(raw);
  if (resolved) {
    return {
      city: resolved.displayName,
      cityIata: resolved.iata ?? "",
    };
  }
  const formatted = formatHotelSearchCityLabel(raw);
  return { city: formatted.label || raw.trim(), cityIata: formatted.iata };
}
