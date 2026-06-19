import { logger } from "@/lib/logger";
import type { DuffelStayQuote, DuffelStaysResult } from "@/lib/providers/duffel/types";

/**
 * Duffel Stays (hotels) — same token as flights, same defensive philosophy
 * as flightOffers.ts: every field optional, skip malformed results, log and
 * degrade honestly instead of throwing. The payload parser is exported
 * separately from the fetch so it's unit-testable with fixtures.
 */

const DUFFEL_STAYS_API = "https://api.duffel.com/stays/search";
const TIMEOUT_MS = 7_000;
const MAX_RESULTS = 12;

/** City-center coordinates for every destination the intent parser knows. */
export const CITY_COORDS: Record<string, { latitude: number; longitude: number }> = {
  VCE: { latitude: 45.4408, longitude: 12.3155 }, // Venice
  BRI: { latitude: 41.1171, longitude: 16.8719 }, // Bari / Puglia
  FCO: { latitude: 41.9028, longitude: 12.4964 }, // Rome
  FLR: { latitude: 43.7696, longitude: 11.2558 }, // Florence
  MXP: { latitude: 45.4642, longitude: 9.19 }, // Milan
  CDG: { latitude: 48.8566, longitude: 2.3522 }, // Paris
  NRT: { latitude: 35.6762, longitude: 139.6503 }, // Tokyo
  HND: { latitude: 35.5494, longitude: 139.7798 }, // Tokyo Haneda
  LHR: { latitude: 51.5074, longitude: -0.1278 }, // London
  HNL: { latitude: 21.3069, longitude: -157.8583 }, // Honolulu
  SEA: { latitude: 47.6062, longitude: -122.3321 }, // Seattle
  LAX: { latitude: 34.0522, longitude: -118.2437 }, // Los Angeles
  ONT: { latitude: 34.0633, longitude: -117.6509 }, // Ontario CA
};

function resolveDuffelToken(): string | null {
  return process.env.DUFFEL_ACCESS_TOKEN?.trim() || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Pure payload → quotes. Exported for unit tests with fixtures. */
export function parseStaysPayload(payload: unknown, nights: number): DuffelStayQuote[] {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const results = Array.isArray(data?.results) ? data.results : [];
  const quotes: DuffelStayQuote[] = [];

  for (const raw of results) {
    const result = asRecord(raw);
    if (!result) continue;
    const accommodation = asRecord(result.accommodation);
    const name = asString(accommodation?.name);
    const total = asNumber(result.cheapest_rate_total_amount);
    if (!name || total === undefined || total <= 0) continue;

    const photos = Array.isArray(accommodation?.photos) ? accommodation.photos : [];
    const firstPhoto = asRecord(photos[0]);
    const location = asRecord(accommodation?.location);
    const address = asRecord(location?.address);
    const chain = asRecord(accommodation?.chain);

    quotes.push({
      id: asString(result.id) ?? `stay-${quotes.length}`,
      name,
      chainName: asString(chain?.name),
      ratingStars: asNumber(accommodation?.rating),
      reviewScore: asNumber(accommodation?.review_score),
      photoUrl: asString(firstPhoto?.url),
      area: asString(address?.city_name) ?? asString(address?.line_one),
      totalAmountUsd: Math.round(total * 100) / 100,
      currency: asString(result.cheapest_rate_currency) ?? "USD",
      nightlyUsd: nights > 0 ? Math.round((total / nights) * 100) / 100 : total,
    });
    if (quotes.length >= MAX_RESULTS) break;
  }
  return quotes;
}

export async function searchDuffelStays(input: {
  destinationIata: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults?: number;
}): Promise<DuffelStaysResult> {
  const token = resolveDuffelToken();
  if (!token) {
    return { configured: false, stays: [] };
  }
  const coords = CITY_COORDS[input.destinationIata.toUpperCase()];
  if (!coords) {
    return { configured: true, stays: [], error: "No geocoding for this destination yet." };
  }

  const adults = Math.min(Math.max(input.adults ?? 2, 1), 4);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(DUFFEL_STAYS_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          rooms: 1,
          guests: Array.from({ length: adults }, () => ({ type: "adult" })),
          check_in_date: input.checkInDate,
          check_out_date: input.checkOutDate,
          location: {
            radius: 6,
            geographic_coordinates: coords,
          },
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn("Duffel stays search failed", {
        scope: "providers/duffel-stays",
        destination: input.destinationIata,
        status: response.status,
        body: text.slice(0, 200),
      });
      return {
        configured: true,
        stays: [],
        error:
          response.status === 403 || response.status === 404
            ? "Stays not enabled on this Duffel account yet."
            : "Hotel search unavailable right now.",
      };
    }

    const payload: unknown = await response.json();
    const stays = parseStaysPayload(payload, input.nights);
    return {
      configured: true,
      stays,
      error: stays.length === 0 ? "No hotels returned for these dates." : undefined,
    };
  } catch (error) {
    logger.warn("Duffel stays search error", {
      scope: "providers/duffel-stays",
      destination: input.destinationIata,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { configured: true, stays: [], error: "Hotel search timed out." };
  } finally {
    clearTimeout(timer);
  }
}
