import { resolveAirport } from "@/lib/airports/lookup";
import {
  HOTEL_DESTINATION_ALIASES,
  normalizeHotelDestinationQuery,
  suggestHotelDestinations,
} from "@/lib/hotels/destinationAliases";

export { suggestHotelDestinations };

/** Known city centers keyed by IATA or alias (uppercase). */
export const HOTEL_CITY_COORDS: Record<string, { lat: number; lng: number; name: string }> = {
  LAX: { lat: 34.0522, lng: -118.2437, name: "Los Angeles" },
  ONT: { lat: 34.0633, lng: -117.6509, name: "Ontario, CA" },
  SNA: { lat: 33.6846, lng: -117.8265, name: "Orange County" },
  JFK: { lat: 40.7128, lng: -74.006, name: "New York" },
  NYC: { lat: 40.7128, lng: -74.006, name: "New York" },
  ORD: { lat: 41.8781, lng: -87.6298, name: "Chicago" },
  MIA: { lat: 25.7617, lng: -80.1918, name: "Miami" },
  LAS: { lat: 36.1699, lng: -115.1398, name: "Las Vegas" },
  SFO: { lat: 37.7749, lng: -122.4194, name: "San Francisco" },
  SEA: { lat: 47.6062, lng: -122.3321, name: "Seattle" },
  DEN: { lat: 39.7392, lng: -104.9903, name: "Denver" },
  BOS: { lat: 42.3601, lng: -71.0589, name: "Boston" },
  MCO: { lat: 28.5383, lng: -81.3792, name: "Orlando" },
  HNL: { lat: 21.3069, lng: -157.8583, name: "Honolulu" },
  BRI: { lat: 41.1177, lng: 16.8512, name: "Bari" },
  BDS: { lat: 40.6383, lng: 17.9461, name: "Brindisi" },
  MONOPOLI: { lat: 40.9526, lng: 17.2972, name: "Monopoli, Italy" },
  POLIGNANO: { lat: 40.9961, lng: 17.2196, name: "Polignano a Mare" },
  LECCE: { lat: 40.3515, lng: 18.175, name: "Lecce, Italy" },
  CORTINA: { lat: 46.5369, lng: 12.1357, name: "Cortina d'Ampezzo" },
  ORTISEI: { lat: 46.576, lng: 11.671, name: "Ortisei" },
  FCO: { lat: 41.9028, lng: 12.4964, name: "Rome" },
  MXP: { lat: 45.4642, lng: 9.19, name: "Milan" },
  VCE: { lat: 45.4408, lng: 12.3155, name: "Venice" },
  NAP: { lat: 40.8518, lng: 14.2681, name: "Naples" },
  FLR: { lat: 43.7696, lng: 11.2558, name: "Florence" },
  MUC: { lat: 48.1351, lng: 11.582, name: "Munich" },
  FRA: { lat: 50.1109, lng: 8.6821, name: "Frankfurt" },
  BER: { lat: 52.52, lng: 13.405, name: "Berlin" },
  LHR: { lat: 51.5074, lng: -0.1278, name: "London" },
  CDG: { lat: 48.8566, lng: 2.3522, name: "Paris" },
  MAD: { lat: 40.4168, lng: -3.7038, name: "Madrid" },
  BCN: { lat: 41.3851, lng: 2.1734, name: "Barcelona" },
  AMS: { lat: 52.3676, lng: 4.9041, name: "Amsterdam" },
  ATH: { lat: 37.9838, lng: 23.7275, name: "Athens" },
  LIS: { lat: 38.7169, lng: -9.1399, name: "Lisbon" },
  NCE: { lat: 43.7102, lng: 7.262, name: "Nice" },
  NRT: { lat: 35.6762, lng: 139.6503, name: "Tokyo" },
  HND: { lat: 35.5494, lng: 139.7798, name: "Tokyo" },
  SYD: { lat: -33.8688, lng: 151.2093, name: "Sydney" },
  CUN: { lat: 21.1619, lng: -86.8515, name: "Cancún" },
  PHX: { lat: 33.4484, lng: -112.074, name: "Phoenix" },
  DFW: { lat: 32.7767, lng: -96.797, name: "Dallas" },
  ATL: { lat: 33.749, lng: -84.388, name: "Atlanta" },
  IAD: { lat: 38.9072, lng: -77.0369, name: "Washington DC" },
  DCA: { lat: 38.9072, lng: -77.0369, name: "Washington DC" },
  SAN: { lat: 32.7157, lng: -117.1611, name: "San Diego" },
  AUS: { lat: 30.2672, lng: -97.7431, name: "Austin" },
  PDX: { lat: 45.5152, lng: -122.6784, name: "Portland" },
};

export interface ResolvedHotelDestination {
  lat: number;
  lng: number;
  displayName: string;
  iata?: string;
  /** Set when we corrected a typo or alias (e.g. Monopoly → Monopoli). */
  correctedFrom?: string;
}

function iataForKnownKey(key: string): string | undefined {
  if (key.length === 3) return key;
  if (key === "MONOPOLI" || key === "POLIGNANO") return "BRI";
  if (key === "LECCE") return "BDS";
  if (key === "CORTINA" || key === "ORTISEI") return "VCE";
  return undefined;
}

function matchKnownCity(input: string, correctedFrom?: string): ResolvedHotelDestination | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const attachCorrection = (result: ResolvedHotelDestination): ResolvedHotelDestination =>
    correctedFrom ? { ...result, correctedFrom } : result;

  const upper = trimmed.toUpperCase();
  if (HOTEL_CITY_COORDS[upper]) {
    const hit = HOTEL_CITY_COORDS[upper];
    return attachCorrection({
      lat: hit.lat,
      lng: hit.lng,
      displayName: hit.name,
      iata: iataForKnownKey(upper),
    });
  }

  const airport = resolveAirport(trimmed);
  if (airport && HOTEL_CITY_COORDS[airport.iata]) {
    const hit = HOTEL_CITY_COORDS[airport.iata];
    return attachCorrection({ lat: hit.lat, lng: hit.lng, displayName: hit.name, iata: airport.iata });
  }

  const needle = trimmed.toLowerCase();
  for (const [key, hit] of Object.entries(HOTEL_CITY_COORDS)) {
    const cityName = hit.name.toLowerCase();
    const cityStem = cityName.split(",")[0]?.trim() ?? cityName;
    if (
      cityStem.includes(needle) ||
      needle.includes(cityStem) ||
      cityName.includes(needle) ||
      needle.includes(cityName)
    ) {
      return attachCorrection({
        lat: hit.lat,
        lng: hit.lng,
        displayName: hit.name,
        iata: iataForKnownKey(key),
      });
    }
  }

  // Alias values like "monopoli" after normalization
  for (const [alias, canonical] of Object.entries(HOTEL_DESTINATION_ALIASES)) {
    if (needle === canonical || needle === alias) {
      const nested = matchKnownCity(canonical, correctedFrom ?? trimmed);
      if (nested) return nested;
    }
  }

  return null;
}

async function geocodeWithNominatim(query: string, countryHint?: string): Promise<ResolvedHotelDestination | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "3");
    url.searchParams.set("addressdetails", "0");
    if (countryHint) {
      url.searchParams.set("countrycodes", countryHint);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "KepiTravel/1.0 (hotel-search; contact@kepitravel.com)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;

    const rows = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const first = rows[0];
    if (!first?.lat || !first.lon) return null;

    const lat = Number.parseFloat(first.lat);
    const lng = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const displayName = first.display_name?.split(",").slice(0, 2).join(",").trim() || query.trim();
    return { lat, lng, displayName };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve coordinates synchronously from known city/airport catalog (no network). */
export function resolveHotelDestinationSync(input: string): ResolvedHotelDestination | null {
  const { query, correctedFrom } = normalizeHotelDestinationQuery(input);
  if (!query) return null;
  return matchKnownCity(query, correctedFrom);
}

/** Resolve a free-text city or airport into coordinates for hotel search. */
export async function resolveHotelDestination(input: string): Promise<ResolvedHotelDestination | null> {
  const { query, correctedFrom } = normalizeHotelDestinationQuery(input);
  if (!query) return null;

  const known = matchKnownCity(query, correctedFrom);
  if (known) return known;

  const countryHint = /\b(italy|italia|it)\b/i.test(input) ? "it" : undefined;
  const geocoded =
    (await geocodeWithNominatim(query, countryHint)) ??
    (await geocodeWithNominatim(`${query}, Italy`, "it"));

  if (!geocoded) return null;
  return correctedFrom ? { ...geocoded, correctedFrom } : geocoded;
}
