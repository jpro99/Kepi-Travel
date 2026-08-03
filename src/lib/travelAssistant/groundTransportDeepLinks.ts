/**
 * Deep links to Uber/Lyft with trip pickup/dropoff prefilled.
 * Native in-app booking deferred until partner API access is granted.
 */

import { getAirportByIata } from "@/lib/travelAssistant/airportGeo";

export interface GroundTransportPoint {
  label: string;
  lat: number;
  lon: number;
}

export interface GroundTransportDeepLinkInput {
  pickup: GroundTransportPoint;
  dropoff: GroundTransportPoint;
  pickupTimeIso?: string;
}

export interface GroundTransportDeepLinks {
  uberUrl: string;
  lyftUrl: string;
  pickupLabel: string;
  dropoffLabel: string;
}

export function buildUberDeepLink(input: GroundTransportDeepLinkInput): string {
  const params = new URLSearchParams({
    action: "setPickup",
    pickup: "my_location",
    "dropoff[latitude]": String(input.dropoff.lat),
    "dropoff[longitude]": String(input.dropoff.lon),
    "dropoff[nickname]": input.dropoff.label,
  });
  if (input.pickupTimeIso) {
    params.set("pickup[latitude]", String(input.pickup.lat));
    params.set("pickup[longitude]", String(input.pickup.lon));
    params.set("pickup[nickname]", input.pickup.label);
  } else {
    params.set("pickup[latitude]", String(input.pickup.lat));
    params.set("pickup[longitude]", String(input.pickup.lon));
    params.set("pickup[nickname]", input.pickup.label);
  }
  return `https://m.uber.com/ul/?${params.toString()}`;
}

export function buildLyftDeepLink(input: GroundTransportDeepLinkInput): string {
  const params = new URLSearchParams({
    "pickup[latitude]": String(input.pickup.lat),
    "pickup[longitude]": String(input.pickup.lon),
    "dropoff[latitude]": String(input.dropoff.lat),
    "dropoff[longitude]": String(input.dropoff.lon),
  });
  return `https://lyft.com/ride?${params.toString()}`;
}

export function buildGroundTransportDeepLinks(
  input: GroundTransportDeepLinkInput,
): GroundTransportDeepLinks {
  return {
    uberUrl: buildUberDeepLink(input),
    lyftUrl: buildLyftDeepLink(input),
    pickupLabel: input.pickup.label,
    dropoffLabel: input.dropoff.label,
  };
}

export function isPlausibleCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function buildRideToAirportDeepLinks(airportIata: string): GroundTransportDeepLinks | null {
  const airport = getAirportByIata(airportIata);
  if (!airport) return null;
  const uberParams = new URLSearchParams({
    action: "setPickup",
    pickup: "my_location",
    "dropoff[latitude]": String(airport.lat),
    "dropoff[longitude]": String(airport.lon),
    "dropoff[nickname]": airport.name,
  });
  const lyftParams = new URLSearchParams({
    pickup: "my_location",
    "dropoff[latitude]": String(airport.lat),
    "dropoff[longitude]": String(airport.lon),
  });
  return {
    uberUrl: `https://m.uber.com/ul/?${uberParams.toString()}`,
    lyftUrl: `https://lyft.com/ride?${lyftParams.toString()}`,
    pickupLabel: "Your location",
    dropoffLabel: airport.name,
  };
}

/** Uber/Lyft from airport curb — optional hotel/city dropoff when coords exist. */
export function buildRideFromAirportDeepLinks(
  airportIata: string,
  dropoff?: GroundTransportPoint | null,
): GroundTransportDeepLinks | null {
  const airport = getAirportByIata(airportIata);
  if (!airport) return null;
  const pickup: GroundTransportPoint = {
    label: airport.name,
    lat: airport.lat,
    lon: airport.lon,
  };
  if (
    dropoff &&
    isPlausibleCoordinate(dropoff.lat, dropoff.lon)
  ) {
    return buildGroundTransportDeepLinks({ pickup, dropoff });
  }
  const uberParams = new URLSearchParams({
    action: "setPickup",
    "pickup[latitude]": String(airport.lat),
    "pickup[longitude]": String(airport.lon),
    "pickup[nickname]": airport.name,
  });
  const lyftParams = new URLSearchParams({
    "pickup[latitude]": String(airport.lat),
    "pickup[longitude]": String(airport.lon),
  });
  return {
    uberUrl: `https://m.uber.com/ul/?${uberParams.toString()}`,
    lyftUrl: `https://lyft.com/ride?${lyftParams.toString()}`,
    pickupLabel: airport.name,
    dropoffLabel: dropoff?.label?.trim() || "Your destination",
  };
}
