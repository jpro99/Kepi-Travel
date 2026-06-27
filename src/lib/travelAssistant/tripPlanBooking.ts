import { buildFlightLegsFromIntent } from "@/lib/decision/flightLegPlanner";
import { buildGoogleFlightsUrl } from "@/lib/decision/bookingLinks";
import type { FlightLegPlan, TripIntent } from "@/lib/decision/types";
import type { StopDateRange } from "@/lib/decision/stopDates";
import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";

export interface PlannedStayCity {
  id: string;
  city: string;
  cityIata?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: "booked" | "needed";
  hotelName?: string;
}

export interface PlannedFlightLeg extends FlightLegPlan {
  status: "booked" | "needed";
  bookedSummary?: string;
  reservationId?: string;
}

interface TripHotelInput {
  id: string;
  location?: string;
  title?: string;
  provider?: string;
  localTime?: string;
  checkOutDate?: string;
}

interface TripFlightInput {
  id: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDate?: string;
  flightDepartureTime?: string;
  localTime?: string;
  provider?: string;
}

function hotelMatchesCity(
  hotel: TripHotelInput,
  cityName: string,
  formattedCity: string,
): boolean {
  const blob = `${hotel.location ?? ""} ${hotel.title ?? ""} ${hotel.provider ?? ""}`.toLowerCase();
  const keys = [cityName, formattedCity.split("(")[0]?.trim() ?? formattedCity]
    .map((value) => value.toLowerCase())
    .filter(Boolean);
  return keys.some((key) => key.length >= 3 && blob.includes(key));
}

function flightDateKey(flight: TripFlightInput): string | null {
  return (
    flight.flightDate?.slice(0, 10) ??
    flight.flightDepartureTime?.slice(0, 10) ??
    flight.localTime?.slice(0, 10) ??
    null
  );
}

function legMatchesFlight(leg: FlightLegPlan, flight: TripFlightInput): boolean {
  const dep = flight.flightDepartureAirport?.trim().toUpperCase();
  const arr = flight.flightArrivalAirport?.trim().toUpperCase();
  if (!dep || !arr || dep !== leg.fromIata || arr !== leg.toIata) return false;
  const date = flightDateKey(flight);
  if (!date || !leg.departureDate) return true;
  const diffDays = Math.abs(Date.parse(`${date}T12:00:00`) - Date.parse(`${leg.departureDate}T12:00:00`)) / 86_400_000;
  return diffDays <= 4;
}

export function buildPlannedStayCities(
  stopRanges: StopDateRange[],
  hotels: TripHotelInput[],
): PlannedStayCity[] {
  return stopRanges.map((range, index) => {
    const formatted = formatHotelSearchCityLabel(range.stop.name);
    const city = formatted.label || range.stop.name;
    const match = hotels.find((hotel) => hotelMatchesCity(hotel, range.stop.name, city));
    return {
      id: `plan-stay-${index}-${range.checkIn}`,
      city,
      cityIata: formatted.iata || range.stop.iata,
      checkIn: range.checkIn,
      checkOut: range.checkOut,
      nights: range.nights,
      status: match ? "booked" : "needed",
      hotelName: match?.title || match?.provider || undefined,
    };
  });
}

export function buildPlannedFlightLegs(
  intent: TripIntent | null | undefined,
  flights: TripFlightInput[],
): PlannedFlightLeg[] {
  if (!intent) return [];
  const legs = buildFlightLegsFromIntent(intent);
  return legs.map((leg) => {
    const match = flights.find((flight) => legMatchesFlight(leg, flight));
    const fn = match?.flightNumber?.trim();
    const summary = match
      ? [fn, `${match.flightDepartureAirport}→${match.flightArrivalAirport}`].filter(Boolean).join(" · ")
      : undefined;
    return {
      ...leg,
      status: match ? "booked" : "needed",
      bookedSummary: summary,
      reservationId: match?.id,
    };
  });
}

export function defaultSelectableFlightLegIds(legs: PlannedFlightLeg[]): string[] {
  return legs.filter((leg) => leg.status === "needed").map((leg) => leg.id);
}

export type FlightSearchMode = "roundtrip" | "oneway" | "multi";

export interface FlightSearchPlan {
  mode: FlightSearchMode;
  url: string;
  summary: string;
  extraUrls?: string[];
}

export function buildFlightSearchPlan(selected: PlannedFlightLeg[]): FlightSearchPlan | null {
  if (selected.length === 0) return null;

  const outbound = selected.find((leg) => leg.role === "outbound");
  const returnLeg = selected.find((leg) => leg.role === "return");

  if (
    selected.length === 2 &&
    outbound &&
    returnLeg &&
    selected.every((leg) => leg.role === "outbound" || leg.role === "return")
  ) {
    return {
      mode: "roundtrip",
      summary: `${outbound.fromLabel} → ${outbound.toLabel}, return ${returnLeg.departureDate}`,
      url: buildGoogleFlightsUrl({
        origin: outbound.fromIata,
        destination: outbound.toIata,
        departureDate: outbound.departureDate,
        returnDate: returnLeg.departureDate,
      }),
    };
  }

  if (selected.length === 1) {
    const leg = selected[0]!;
    return {
      mode: "oneway",
      summary: `${leg.fromLabel} → ${leg.toLabel} · ${leg.departureDate}`,
      url: buildGoogleFlightsUrl({
        origin: leg.fromIata,
        destination: leg.toIata,
        departureDate: leg.departureDate,
      }),
    };
  }

  const urls = selected.map((leg) =>
    buildGoogleFlightsUrl({
      origin: leg.fromIata,
      destination: leg.toIata,
      departureDate: leg.departureDate,
    }),
  );
  return {
    mode: "multi",
    summary: `${selected.length} flights · ${selected.map((leg) => `${leg.fromLabel}→${leg.toLabel}`).join(", ")}`,
    url: urls[0]!,
    extraUrls: urls.slice(1),
  };
}

export function formatStayDateRange(checkIn: string, checkOut: string): string {
  const fmt = (iso: string) => {
    const date = new Date(`${iso}T12:00:00`);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return `${fmt(checkIn)} – ${fmt(checkOut)}`;
}

export function plannedStayCityToSegment(city: PlannedStayCity): TripStaySegment {
  const shortCity = city.city.split("(")[0]?.trim() || city.city;
  return {
    id: city.id,
    city: city.city,
    cityIata: city.cityIata,
    checkIn: city.checkIn,
    checkOut: city.checkOut,
    source: "trip",
    nights: city.nights,
    status: city.status === "booked" ? "booked" : "missing",
    label: `${shortCity} · ${city.checkIn}`,
    stopKind: "destination",
    stayIntent: "needs_hotel",
    suggestedIntent: "needs_hotel",
    intentReason: "From your itinerary plan",
    connectionHours: null,
    needsDecision: false,
  };
}
