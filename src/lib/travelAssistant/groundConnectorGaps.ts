import { formatHotelSearchCityLabel } from "@/lib/hotels/tripSearchContext";
import { airportToCity } from "@/lib/travelAssistant/buildTripLegs";
import { buildHotelStaySpans, type HotelStayLegInput } from "@/lib/travelAssistant/hotelAnchoredStayLegs";
import { citiesLikelySame } from "@/lib/hotels/hotelReservationCity";
import {
  airportServesStayCity,
  isLocalGroundHop,
} from "@/lib/travelAssistant/metroAirportCoverage";
import { legCoveredByGroundTransport } from "@/lib/travelAssistant/quickGroundTransport";
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
}

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
    fromLabel,
    toLabel,
    fromIata,
    toIata,
    departureDate: fromDay,
    role: "connector" as const,
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

  for (const flight of flights) {
    const arrivalDay = flightArrivalDay(flight);
    const arrivalIata = flight.flightArrivalAirport?.trim().toUpperCase() ?? "";
    if (!arrivalDay || !arrivalIata) continue;

    const arrivalLabel = formatHotelSearchCityLabel(arrivalIata).label || airportToCity(arrivalIata);
    const firstHotel = hotelSpans.find(
      (span) => span.startDate >= arrivalDay && span.startDate <= addDays(arrivalDay, 21),
    );
    if (!firstHotel) continue;
    if (!citiesDiffer(arrivalLabel, firstHotel.city)) continue;
    if (airportServesStayCity(arrivalIata, firstHotel.city)) continue;
    if (
      hasGroundTransportBetween(
        input.reservations,
        arrivalDay,
        firstHotel.startDate,
        arrivalLabel,
        firstHotel.city,
        arrivalIata,
      )
    ) {
      continue;
    }

    gaps.push({
      id: `airport-transfer-${flight.id}-${firstHotel.hotelId}`,
      kind: "airport_transfer",
      fromLabel: arrivalLabel,
      toLabel: firstHotel.city,
      fromIata: arrivalIata,
      toIata: "",
      travelDate: arrivalDay,
      detail: `You land at ${arrivalIata} (${arrivalLabel}) but your first hotel is in ${firstHotel.city}. How are you getting there?`,
    });
  }

  for (let index = 0; index < hotelSpans.length - 1; index++) {
    const current = hotelSpans[index]!;
    const next = hotelSpans[index + 1]!;
    if (!citiesDiffer(current.city, next.city)) continue;
    if (isLocalGroundHop(current.city, next.city)) continue;

    const travelDate = current.endDate;
    if (
      hasGroundTransportBetween(
        input.reservations,
        travelDate,
        next.startDate,
        current.city,
        next.city,
      )
    ) {
      continue;
    }

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
