import { buildFlightLegsFromIntent } from "@/lib/decision/flightLegPlanner";
import { buildGoogleFlightsUrl } from "@/lib/decision/bookingLinks";
import type { FlightLegPlan, TripIntent } from "@/lib/decision/types";
import type { StopDateRange } from "@/lib/decision/stopDates";
import { mergeStopRanges, pickPrimaryStayPerCity } from "@/lib/travelAssistant/dayNoteStopRanges";
import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import { resolveHotelDestinationSync } from "@/lib/hotels/resolveDestination";
import {
  citiesLikelySame,
  deriveHotelSearchCityFromReservation,
  enrichHotelReservationForMatching,
  singleStayHotelFallback,
} from "@/lib/hotels/hotelReservationCity";
import { hotelReservationMatchesCity } from "@/lib/hotels/hotelStayMatch";
import { parseDayIntentFromLines } from "@/lib/travelAssistant/dayPlanLines";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import {
  describeBookedAirportPath,
  hasBookedAirportPath,
  legDepartureAlignedWithBookedPath,
  type ItineraryPathSegment,
} from "@/lib/travelAssistant/itineraryPathCoverage";
import {
  legCoveredByGroundTransport,
  type TripGroundTransportInput,
} from "@/lib/travelAssistant/quickGroundTransport";

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
  hotelSearchCity?: string;
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

function flightToPathHop(flight: TripFlightInput): ItineraryPathSegment | null {
  const dep = flight.flightDepartureAirport?.trim().toUpperCase();
  const arr = flight.flightArrivalAirport?.trim().toUpperCase();
  if (!dep || !arr) return null;
  const date = flightDateKey(flight);
  return {
    fromCode: dep,
    toCode: arr,
    booked: true,
    departMs: date ? Date.parse(`${date}T12:00:00`) : null,
  };
}

function legCoveredByFlights(
  leg: FlightLegPlan,
  flights: TripFlightInput[],
): { covered: boolean; summary?: string; reservationId?: string } {
  const direct = flights.find((flight) => legMatchesFlight(leg, flight));
  if (direct) {
    const fn = direct.flightNumber?.trim();
    return {
      covered: true,
      summary: [fn, `${direct.flightDepartureAirport}→${direct.flightArrivalAirport}`].filter(Boolean).join(" · "),
      reservationId: direct.id,
    };
  }

  const hops = flights.map(flightToPathHop).filter((hop): hop is ItineraryPathSegment => hop !== null);
  if (!hasBookedAirportPath(hops, leg.fromIata, leg.toIata)) return { covered: false };
  if (!legDepartureAlignedWithBookedPath(hops, leg.fromIata, leg.departureDate)) return { covered: false };

  const path = describeBookedAirportPath(hops, leg.fromIata, leg.toIata);
  const firstHop = flights.find(
    (flight) => flight.flightDepartureAirport?.trim().toUpperCase() === leg.fromIata.toUpperCase(),
  );
  return {
    covered: true,
    summary: path ? `Booked ${path}` : "Booked via connections",
    reservationId: firstHop?.id,
  };
}

export function buildPlannedStayCities(
  stopRanges: StopDateRange[],
  hotels: TripHotelInput[],
): PlannedStayCity[] {
  const merged = pickPrimaryStayPerCity(mergeStopRanges(stopRanges));
  const enrichedHotels = hotels.map(enrichHotelReservationForMatching);
  const fallbackHotel = singleStayHotelFallback(enrichedHotels, merged.length);

  return merged.map((range, index) => {
    const formatted = formatHotelSearchCityLabel(range.stop.name);
    const city = formatted.label || range.stop.name;
    let match = enrichedHotels.find((hotel) => hotelReservationMatchesCity(hotel, range.stop.name) || hotelReservationMatchesCity(hotel, city));
    if (!match && fallbackHotel) {
      match = fallbackHotel;
    }
    if (!match && fallbackHotel && citiesLikelySame(deriveHotelSearchCityFromReservation(fallbackHotel) ?? "", range.stop.name)) {
      match = fallbackHotel;
    }
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
  stopRanges: StopDateRange[] = [],
  dayNotes: Record<string, string> = {},
  tripStart?: string | null,
  tripEnd?: string | null,
  groundTransport: TripGroundTransportInput[] = [],
): PlannedFlightLeg[] {
  const start = intent?.startDate ?? tripStart?.slice(0, 10) ?? stopRanges[0]?.checkIn;
  const end = intent?.endDate ?? tripEnd?.slice(0, 10) ?? stopRanges[stopRanges.length - 1]?.checkOut;
  const legs =
    intent && (intent.stops?.length ?? 0) > 0
      ? buildFlightLegsFromIntent(intent)
      : buildFlightLegsFromStopRanges(stopRanges, start, end, dayNotes);
  return legs.map((leg) => {
    const flightCoverage = legCoveredByFlights(leg, flights);
    const groundCoverage = flightCoverage.covered
      ? { covered: false as const }
      : legCoveredByGroundTransport(leg, groundTransport);
    const covered = flightCoverage.covered || groundCoverage.covered;
    const match = flightCoverage.covered ? flights.find((flight) => legMatchesFlight(leg, flight)) : undefined;
    const fn = match?.flightNumber?.trim();
    const summary =
      flightCoverage.summary ??
      groundCoverage.summary ??
      (match ? [fn, `${match.flightDepartureAirport}→${match.flightArrivalAirport}`].filter(Boolean).join(" · ") : undefined);
    return {
      ...leg,
      status: covered ? "booked" : "needed",
      bookedSummary: summary,
      reservationId: flightCoverage.reservationId ?? groundCoverage.reservationId ?? match?.id,
    };
  });
}

function iataForCity(city: string): string | undefined {
  const sync = resolveHotelDestinationSync(city);
  if (sync?.iata?.trim()) return sync.iata.trim().toUpperCase();
  const formatted = formatHotelSearchCityLabel(city);
  return formatted.iata?.trim() ? formatted.iata.trim().toUpperCase() : undefined;
}

function resolveStopEndpoints(stop: { name: string; iata?: string }): { iata: string; label: string } {
  const sync = resolveHotelDestinationSync(stop.name);
  const formatted = formatHotelSearchCityLabel(stop.name);
  const iata = stop.iata?.trim().toUpperCase() || sync?.iata?.trim().toUpperCase() || formatted.iata?.trim().toUpperCase() || "";
  const label = sync?.displayName || formatted.label || stop.name;
  return { iata, label };
}

function homeFromDayNotes(dayNotes: Record<string, string>, tripStart?: string): { city: string; iata?: string } | null {
  const keys = Object.keys(dayNotes).sort();
  const firstKey = tripStart && dayNotes[tripStart] ? tripStart : keys[0];
  if (!firstKey) return null;
  const intent = parseDayIntentFromLines(dayNotes[firstKey] ?? "");
  if (!intent?.fromCity) return null;
  return { city: intent.fromCity, iata: iataForCity(intent.fromCity) };
}

function returnTargetFromDayNotes(
  dayNotes: Record<string, string>,
  tripEnd?: string,
): { city: string; iata?: string } | null {
  const keys = Object.keys(dayNotes).sort();
  const lastKey = tripEnd && dayNotes[tripEnd] ? tripEnd : keys[keys.length - 1];
  if (!lastKey) return null;
  const intent = parseDayIntentFromLines(dayNotes[lastKey] ?? "");
  if (intent?.toCity && intent.kind === "depart") {
    return { city: intent.toCity, iata: iataForCity(intent.toCity) };
  }
  if (intent?.fromCity && /\bfly home\b/iu.test(dayNotes[lastKey] ?? "")) {
    const home = homeFromDayNotes(dayNotes);
    if (home) return home;
  }
  return null;
}

/** Build flight legs from calendar/itinerary city ranges when no full talk-to-plan intent exists. */
export function buildFlightLegsFromStopRanges(
  ranges: StopDateRange[],
  tripStart?: string,
  tripEnd?: string,
  dayNotes: Record<string, string> = {},
): FlightLegPlan[] {
  if (ranges.length === 0 || !tripStart || !tripEnd) return [];

  const legs: FlightLegPlan[] = [];
  const home = homeFromDayNotes(dayNotes, tripStart);
  const returnTarget = returnTargetFromDayNotes(dayNotes, tripEnd) ?? home;
  const first = ranges[0]!;
  const last = ranges[ranges.length - 1]!;
  const firstIata = first.stop.iata?.toUpperCase() ?? iataForCity(first.stop.name)?.toUpperCase();
  const lastIata = last.stop.iata?.toUpperCase() ?? iataForCity(last.stop.name)?.toUpperCase();
  const homeIata = home?.iata?.toUpperCase();

  if (homeIata && firstIata) {
    legs.push({
      id: "outbound",
      role: "outbound",
      fromIata: homeIata,
      toIata: firstIata,
      fromLabel: home?.city ?? homeIata,
      toLabel: first.stop.name,
      enabled: true,
      optional: false,
      departureDate: tripStart,
    });
  }

  for (let index = 0; index < ranges.length - 1; index += 1) {
    const fromStop = ranges[index]!;
    const toStop = ranges[index + 1]!;
    const from = resolveStopEndpoints(fromStop.stop);
    const to = resolveStopEndpoints(toStop.stop);
    if (!from.iata && !to.iata) continue;
    legs.push({
      id: `connector-${index}`,
      role: "connector",
      fromIata: from.iata || from.label.slice(0, 3).toUpperCase(),
      toIata: to.iata || to.label.slice(0, 3).toUpperCase(),
      fromLabel: from.label,
      toLabel: to.label,
      enabled: true,
      optional: false,
      departureDate: fromStop.checkOut,
    });
  }

  if (homeIata && lastIata && returnTarget) {
    legs.push({
      id: "return",
      role: "return",
      fromIata: lastIata,
      toIata: homeIata,
      fromLabel: last.stop.name,
      toLabel: returnTarget.city,
      enabled: true,
      optional: false,
      departureDate: tripEnd,
    });
  }

  return legs;
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
