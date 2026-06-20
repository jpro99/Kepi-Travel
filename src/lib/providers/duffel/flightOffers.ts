import type { DuffelFlightQuote, DuffelSearchResult } from "@/lib/providers/duffel/types";
import { logger } from "@/lib/logger";
import { getSafeRedisClient } from "@/lib/redis";

const DUFFEL_API = "https://api.duffel.com/air/offer_requests";
const TIMEOUT_MS = 9_000;     // 9s per Duffel call
const MAX_ORIGINS = 3;         // up to 3 origins in parallel
const CACHE_TTL_SECONDS = 900; // 15-minute Redis cache — Duffel prices are stable short-term

function resolveDuffelToken(): string | null {
  return process.env.DUFFEL_ACCESS_TOKEN?.trim() || null;
}

function cacheKey(origin: string, destination: string, date: string, cabin: string): string {
  return `kepi:duffel:v2:${origin}:${destination}:${date}:${cabin}`;
}

function parseAmount(amount: string | undefined, currency: string | undefined): number {
  const value = Number.parseFloat(amount ?? "NaN");
  if (!Number.isFinite(value)) return 0;
  if ((currency ?? "USD").toUpperCase() === "USD") return value;
  return value;
}

function countStops(offer: Record<string, unknown>): number {
  const slices = offer.slices;
  if (!Array.isArray(slices) || slices.length === 0) return 0;
  const first = slices[0];
  if (!first || typeof first !== "object") return 0;
  const segments = (first as Record<string, unknown>).segments;
  return Array.isArray(segments) ? Math.max(0, segments.length - 1) : 0;
}

function extractFlightNumber(offer: Record<string, unknown>): string | undefined {
  const slices = offer.slices;
  if (!Array.isArray(slices) || slices.length === 0) return undefined;
  const first = slices[0];
  if (!first || typeof first !== "object") return undefined;
  const segments = (first as Record<string, unknown>).segments;
  if (!Array.isArray(segments) || segments.length === 0) return undefined;
  const seg = segments[0] as Record<string, unknown>;
  const iata = (seg.operating_carrier_code ?? seg.marketing_carrier_code ?? "") as string;
  const number = (seg.operating_carrier_flight_number ?? seg.marketing_carrier_flight_number ?? "") as string;
  if (!iata || !number) return undefined;
  return `${iata}${number}`.replace(/\s+/g, "").toUpperCase();
}

async function fetchOfferForRoute(
  token: string,
  origin: string,
  destination: string,
  departureDate: string,
  cabinClass: "economy" | "premium_economy" | "business" | "first",
): Promise<DuffelFlightQuote | null> {
  // Check Redis cache first — 15 min TTL means near-instant repeat searches
  const redis = getSafeRedisClient("duffel-cache");
  const key = cacheKey(origin, destination, departureDate, cabinClass);

  if (redis) {
    try {
      const cached = await redis.get<DuffelFlightQuote | null>(key);
      if (cached !== null && cached !== undefined) {
        logger.info("Duffel cache hit", { scope: "providers/duffel", origin, destination, departureDate });
        return cached;
      }
    } catch {
      // Cache miss or Redis error — fall through to live API
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(DUFFEL_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          cabin_class: cabinClass,
          return_offers: false, // Don't wait for all airlines — get fastest response
          slices: [{ origin, destination, departure_date: departureDate }],
          passengers: [{ type: "adult" }],
          max_connections: 1,   // Direct + 1 stop only — reduces Duffel search time
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn("Duffel offer request failed", {
        scope: "providers/duffel",
        origin, destination,
        status: response.status,
        body: text.slice(0, 200),
      });
      return null;
    }

    const payload = (await response.json()) as { data?: Record<string, unknown> };
    const offers = payload.data?.offers;
    if (!Array.isArray(offers) || offers.length === 0) return null;

    let best: Record<string, unknown> | null = null;
    let bestAmount = Number.POSITIVE_INFINITY;

    for (const offer of offers) {
      if (!offer || typeof offer !== "object") continue;
      const row = offer as Record<string, unknown>;
      const amount = parseAmount(
        typeof row.total_amount === "string" ? row.total_amount : undefined,
        typeof row.total_currency === "string" ? row.total_currency : undefined,
      );
      if (amount > 0 && amount < bestAmount) {
        bestAmount = amount;
        best = row;
      }
    }

    if (!best) return null;

    const result: DuffelFlightQuote = {
      offerId: typeof best.id === "string" ? best.id : undefined,
      origin,
      destination,
      departureDate,
      cabinClass,
      totalAmountUsd: bestAmount,
      currency: typeof best.total_currency === "string" ? best.total_currency : "USD",
      airline: (() => {
        const slices = best.slices;
        if (!Array.isArray(slices) || !slices[0]) return undefined;
        const segments = (slices[0] as Record<string, unknown>).segments;
        if (!Array.isArray(segments) || !segments[0]) return undefined;
        const seg = segments[0] as Record<string, unknown>;
        return typeof seg.operating_carrier_code === "string"
          ? seg.operating_carrier_code
          : typeof seg.marketing_carrier_code === "string"
            ? seg.marketing_carrier_code
            : undefined;
      })(),
      stops: countStops(best),
      flightNumber: extractFlightNumber(best),
    };

    // Cache result in Redis for 15 minutes
    if (redis) {
      try {
        await redis.set(key, result, { ex: CACHE_TTL_SECONDS });
      } catch {
        // Cache write failure is non-fatal
      }
    }

    return result;

  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    logger.warn("Duffel fetch error", {
      scope: "providers/duffel",
      origin, destination,
      reason: isAbort ? "timeout" : err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}

export async function searchDuffelCashQuotes(input: {
  origins: string[];
  destination: string;
  departureDate: string;
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
}): Promise<DuffelSearchResult> {
  const token = resolveDuffelToken();
  if (!token) {
    return { configured: false, quotes: [] };
  }

  if (!input.destination || input.destination.length < 2) {
    return { configured: true, quotes: [] };
  }

  const cabin = input.cabinClass ?? "economy";
  const origins = [...new Set(input.origins.map((o) => o.toUpperCase()))].slice(0, MAX_ORIGINS);

  // All origins searched in parallel — total time = slowest single call, not sum
  const results = await Promise.all(
    origins.map((origin) =>
      fetchOfferForRoute(token, origin, input.destination.toUpperCase(), input.departureDate, cabin)
        .catch(() => null),
    ),
  );

  const quotes = results.filter((r): r is DuffelFlightQuote => r !== null);

  return { configured: true, quotes };
}
