import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import { resolveHotelDestinationSync } from "@/lib/hotels/resolveDestination";
import { airportToCity } from "@/lib/travelAssistant/buildTripLegs";
import { buildHotelStaySpans, type HotelStayLegInput } from "@/lib/travelAssistant/hotelAnchoredStayLegs";
import { citiesLikelySame } from "@/lib/hotels/hotelReservationCity";
import {
  airportServesStayCity,
  isLocalGroundHop,
} from "@/lib/travelAssistant/metroAirportCoverage";
import {
  hasBookedAirportPath,
  type ItineraryPathSegment,
} from "@/lib/travelAssistant/itineraryPathCoverage";
import { suggestInterCityRoute } from "@/lib/travelAssistant/interCityTransportSuggestions";
import { legCoveredByGroundTransport } from "@/lib/travelAssistant/quickGroundTransport";
import { coverHopWithBookedFacts } from "@/lib/travelAssistant/bookedHopCoverage";
import { normalizeDayPlanCity } from "@/lib/travelAssistant/normalizeDayPlanCity";

import type { PlannedFlightLeg } from "@/lib/travelAssistant/tripPlanBooking";
import type { InterCityTransportGap } from "@/lib/travelAssistant/interCityTransport";

export type GroundConnectorKind = "airport_transfer" | "inter_city";

export interface GroundConnectorGap {
  id: string;
  kind: GroundConnectorKind;
  fromLabel: string;
  toLabel: string;
  fromIata: string;
  toIata: string;
  travelDate: string;
  detail: string;
}

interface ConnectorReservation {
  id: string;
  type: string;
  localTime: string;
  flightDate?: string;
  flightArrivalAirport?: string;
  flightDepartureAirport?: string;
  location?: string;
  checkOutDate?: string;
  title?: string;
  // Widened to accept null: callers (e.g. GroundConnectorPrompts' reservation
  // shape) source this from stored reservation data where it's nullable, and
  // this field isn't actually read anywhere in this file — only structural.
  confirmationCode?: string | null;
}

/** Ground connectors are regional transfers — never cross-country legs. */
const MAX_AIRPORT_GROUND_KM = 400;
const MAX_INTERCITY_GROUND_KM = 500;

function cityKey(value: string): string {
  return normalizeDayPlanCity(value).toLowerCase();
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

function flightArrivalDay(reservation: ConnectorReservation): string | null {
  return isoDate(reservation.flightDate) ?? isoDate(reservation.localTime);
}

function iataForStayCity(city: string): string | null {
  const served = resolveHotelDestinationSync(city)?.iata?.trim().toUpperCase();
  return served && served.length === 3 ? served : null;
}

function groundDistanceKm(
  fromLabel: string,
  toLabel: string,
  fromIata = "",
  toIata = "",
): number | null {
  const fromCode = fromIata.trim().toUpperCase();
  const toCode = toIata.trim().toUpperCase();
  const route =
    fromCode.length === 3 && fromCode === toCode && !citiesLikelySame(fromLabel, toLabel)
      ? suggestInterCityRoute(fromLabel, toLabel, "", "")
      : suggestInterCityRoute(fromLabel, toLabel, fromIata, toIata);
  return route?.distanceKm ?? null;
}

function isReasonableGroundDistance(
  fromLabel: string,
  toLabel: string,
  fromIata: string,
  toIata: string,
  maxKm: number,
): boolean {
  const km = groundDistanceKm(fromLabel, toLabel, fromIata, toIata);
  return km !== null && km > 0 && km <= maxKm;
}

function buildBookedFlightHops(flights: ConnectorReservation[]): ItineraryPathSegment[] {
  const hops: ItineraryPathSegment[] = [];
  for (const flight of flights) {
    const dep = flight.flightDepartureAirport?.trim().toUpperCase() ?? "";
    const arr = flight.flightArrivalAirport?.trim().toUpperCase() ?? "";
    if (!dep || !arr || dep === arr) continue;
    const day = flightArrivalDay(flight);
    hops.push({
      fromCode: dep,
      toCode: arr,
      booked: true,
      departMs: day ? Date.parse(`${day}T12:00:00`) : null,
    });
  }
  return hops;
}

function bookedFlightsConnectStayCities(
  hops: ItineraryPathSegment[],
  fromCity: string,
  toCity: string,
): boolean {
  const fromIata = iataForStayCity(fromCity);
  const toIata = iataForStayCity(toCity);
  if (!fromIata || !toIata) return false;
  if (fromIata === toIata) return true;
  return hasBookedAirportPath(hops, fromIata, toIata);
}

function bookedFlightsReachHotel(
  hops: ItineraryPathSegment[],
  arrivalIata: string,
  hotelCity: string,
): boolean {
  const hotelIata = iataForStayCity(hotelCity);
  if (!hotelIata) return false;
  if (arrivalIata === hotelIata) return true;
  if (airportServesStayCity(arrivalIata, hotelCity)) return true;
  return hasBookedAirportPath(hops, arrivalIata, hotelIata);
}

function hopDepartsInWindow(hop: ItineraryPathSegment, fromDay: string, toDay: string): boolean {
  if (hop.departMs == null || !Number.isFinite(hop.departMs)) return true;
  const startMs = Date.parse(`${fromDay}T00:00:00Z`);
  const endMs = Date.parse(`${toDay}T23:59:59Z`) + 2 * 86_400_000;
  return hop.departMs >= startMs - 86_400_000 && hop.departMs <= endMs;
}

function flightsCoverHotelTransition(
  flights: ConnectorReservation[],
  fromCity: string,
  toCity: string,
  travelDate: string,
  nextStartDate: string,
): boolean {
  const stubLeg = {
    id: `connector-${fromCity}-${toCity}`,
    fromLabel: fromCity,
    toLabel: toCity,
    fromIata: iataForStayCity(fromCity) ?? "",
    toIata: iataForStayCity(toCity) ?? "",
    departureDate: travelDate,
    role: "connector" as const,
    enabled: true,
    optional: false,
  };
  if (coverHopWithBookedFacts(stubLeg, flights, []).covered) return true;

  const hops = buildBookedFlightHops(flights);
  if (!bookedFlightsConnectStayCities(hops, fromCity, toCity)) return false;

  const fromIata = iataForStayCity(fromCity);
  if (!fromIata) return true;

  return hops.some(
    (hop) => hop.fromCode === fromIata && hopDepartsInWindow(hop, travelDate, nextStartDate),
  );
}

function hasGroundTransportBetween(
  reservations: ConnectorReservation[],
  fromDay: string,
  toDay: string,
  fromLabel: string,
  toLabel: string,
  fromIata = "",
  toIata = "",
): boolean {
  const windowEnd = toDay > fromDay ? toDay : addDays(fromDay, 1);
  const stubLeg = {
    id: `connector-${fromLabel}-${toLabel}`,
    fromLabel,
    toLabel,
    fromIata,
    toIata,
    departureDate: fromDay,
    role: "connector" as const,
    enabled: true,
    optional: false,
  };
  const transports = reservations.filter((reservation) => ["ride", "train"].includes(reservation.type));
  if (legCoveredByGroundTransport(stubLeg, transports).covered) {
    return true;
  }

  return reservations.some((reservation) => {
    if (!["ride", "train"].includes(reservation.type)) return false;
    const day = isoDate(reservation.localTime);
    if (!day) return false;
    if (day < fromDay || day > windowEnd) return false;
    const routeText = reservation.location?.trim() || reservation.title?.trim() || "";
    if (!routeText) return true;
    const parts = routeText.split(/→|->| to /iu).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return true;
    return citiesLikelySame(parts[0] ?? "", fromLabel) && citiesLikelySame(parts[1] ?? "", toLabel);
  });
}

function citiesDiffer(a: string, b: string): boolean {
  const left = cityKey(a);
  const right = cityKey(b);
  if (!left || !right) return false;
  return left !== right;
}

function isValidFlightHop(flight: ConnectorReservation): boolean {
  const dep = flight.flightDepartureAirport?.trim().toUpperCase() ?? "";
  const arr = flight.flightArrivalAirport?.trim().toUpperCase() ?? "";
  return dep.length === 3 && arr.length === 3 && dep !== arr;
}

/** Airport → first hotel and hotel → hotel ground legs still missing from the trip. */
export function detectGroundConnectorGaps(input: {
  reservations: ConnectorReservation[];
  tripStart?: string | null;
  tripEnd?: string | null;
}): GroundConnectorGap[] {
  const gaps: GroundConnectorGap[] = [];
  const tripStart = isoDate(input.tripStart) ?? "1970-01-01";
  const tripEnd = isoDate(input.tripEnd) ?? "2099-12-31";

  const flights = input.reservations
    .filter((reservation) => reservation.type === "flight")
    .sort((a, b) => (flightArrivalDay(a) ?? "").localeCompare(flightArrivalDay(b) ?? ""));

  const hotels = input.reservations.filter((reservation) => reservation.type === "hotel") as HotelStayLegInput[];
  const hotelSpans = buildHotelStaySpans(hotels, tripStart, tripEnd);
  const flightHops = buildBookedFlightHops(flights);

  const firstHotel = hotelSpans[0];
  if (firstHotel) {
    const inboundFlights = flights.filter((flight) => {
      if (!isValidFlightHop(flight)) return false;
      const arrivalDay = flightArrivalDay(flight);
      return Boolean(arrivalDay && arrivalDay <= firstHotel.startDate);
    });
    const arrivalFlight = inboundFlights[inboundFlights.length - 1];

    if (arrivalFlight) {
      const arrivalDay = flightArrivalDay(arrivalFlight)!;
      const arrivalIata = arrivalFlight.flightArrivalAirport!.trim().toUpperCase();
      const arrivalLabel = formatHotelSearchCityLabel(arrivalIata).label || airportToCity(arrivalIata);

      const shouldSkip =
        !citiesDiffer(arrivalLabel, firstHotel.city) ||
        airportServesStayCity(arrivalIata, firstHotel.city) ||
        bookedFlightsReachHotel(flightHops, arrivalIata, firstHotel.city) ||
        !isReasonableGroundDistance(arrivalLabel, firstHotel.city, arrivalIata, "", MAX_AIRPORT_GROUND_KM) ||
        hasGroundTransportBetween(
          input.reservations,
          arrivalDay,
          firstHotel.startDate,
          arrivalLabel,
          firstHotel.city,
          arrivalIata,
        );

      if (!shouldSkip) {
        gaps.push({
          id: `airport-transfer-${arrivalFlight.id}-${firstHotel.hotelId}`,
          kind: "airport_transfer",
          fromLabel: arrivalLabel,
          toLabel: firstHotel.city,
          fromIata: arrivalIata,
          toIata: "",
          travelDate: arrivalDay,
          detail: `You land at ${arrivalIata} (${arrivalLabel}) but your first hotel is in ${firstHotel.city}. How are you getting there?`,
        });
      }
    }
  }

  for (let index = 0; index < hotelSpans.length - 1; index++) {
    const current = hotelSpans[index]!;
    const next = hotelSpans[index + 1]!;
    if (!citiesDiffer(current.city, next.city)) continue;
    if (isLocalGroundHop(current.city, next.city)) continue;

    const travelDate = current.endDate;
    const shouldSkip =
      flightsCoverHotelTransition(flights, current.city, next.city, travelDate, next.startDate) ||
      !isReasonableGroundDistance(current.city, next.city, "", "", MAX_INTERCITY_GROUND_KM) ||
      hasGroundTransportBetween(
        input.reservations,
        travelDate,
        next.startDate,
        current.city,
        next.city,
      );

    if (shouldSkip) continue;

    gaps.push({
      id: `inter-city-${current.hotelId}-${next.hotelId}`,
      kind: "inter_city",
      fromLabel: current.city,
      toLabel: next.city,
      fromIata: "",
      toIata: "",
      travelDate,
      detail: `You're staying in ${current.city}, then ${next.city}. How are you getting between them?`,
    });
  }

  const seen = new Set<string>();
  return gaps.filter((gap) => {
    if (seen.has(gap.id)) return false;
    seen.add(gap.id);
    return true;
  });
}

/** Adapter so Home ground gaps reuse quick-ground transport + route sheet. */
export function groundConnectorToInterCityGap(gap: GroundConnectorGap): InterCityTransportGap {
  const stubLeg: PlannedFlightLeg = {
    id: gap.id,
    fromIata: gap.fromIata,
    toIata: gap.toIata,
    fromLabel: gap.fromLabel,
    toLabel: gap.toLabel,
    departureDate: gap.travelDate,
    role: "connector",
    status: "needed",
    enabled: true,
    optional: false,
  };
  return {
    id: gap.id,
    fromLabel: gap.fromLabel,
    toLabel: gap.toLabel,
    fromIata: gap.fromIata,
    toIata: gap.toIata,
    departureDate: gap.travelDate,
    dateDisplay: gap.travelDate,
    role: "connector",
    leg: stubLeg,
  };
}
