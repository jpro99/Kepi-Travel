import type { DuffelFlightQuote, DuffelSearchResult } from "@/lib/providers/duffel/types";
import { logger } from "@/lib/logger";
import { getSafeRedisClient } from "@/lib/redis";

const OFFER_REQUEST_URL = "https://api.duffel.com/air/offer_requests";
const OFFERS_URL = "https://api.duffel.com/air/offers";
const CACHE_TTL_SECONDS = 900; // 15 min cache
const MAX_ORIGINS = 3;

function resolveDuffelToken(): string | null {
  return process.env.DUFFEL_ACCESS_TOKEN?.trim() || null;
}

function cacheKey(origin: string, dest: string, date: string, cabin: string) {
  return `kepi:duffel:v3:${origin}:${dest}:${date}:${cabin}`;
}

function parseAmount(amount: string | undefined, currency: string | undefined): number {
  const v = Number.parseFloat(amount ?? "NaN");
  if (!Number.isFinite(v)) return 0;
  return (currency ?? "USD").toUpperCase() === "USD" ? v : v;
}

function countStops(offer: Record<string, unknown>): number {
  const slices = offer.slices;
  if (!Array.isArray(slices) || !slices[0]) return 0;
  const segs = (slices[0] as Record<string, unknown>).segments;
  return Array.isArray(segs) ? Math.max(0, segs.length - 1) : 0;
}

function extractAirline(offer: Record<string, unknown>): string | undefined {
  const slices = offer.slices;
  if (!Array.isArray(slices) || !slices[0]) return undefined;
  const segs = (slices[0] as Record<string, unknown>).segments;
  if (!Array.isArray(segs) || !segs[0]) return undefined;
  const seg = segs[0] as Record<string, unknown>;
  return (seg.operating_carrier_code ?? seg.marketing_carrier_code) as string | undefined;
}

function extractFlightNumber(offer: Record<string, unknown>): string | undefined {
  const slices = offer.slices;
  if (!Array.isArray(slices) || !slices[0]) return undefined;
  const segs = (slices[0] as Record<string, unknown>).segments;
  if (!Array.isArray(segs) || !segs[0]) return undefined;
  const seg = segs[0] as Record<string, unknown>;
  const iata = (seg.operating_carrier_code ?? seg.marketing_carrier_code ?? "") as string;
  const num = (seg.operating_carrier_flight_number ?? seg.marketing_carrier_flight_number ?? "") as string;
  if (!iata || !num) return undefined;
  return `${iata}${num}`.replace(/\s+/g, "").toUpperCase();
}

function bestOffer(offers: unknown[]): DuffelFlightQuote | null {
  let best: Record<string, unknown> | null = null;
  let bestAmount = Infinity;
  for (const offer of offers) {
    if (!offer || typeof offer !== "object") continue;
    const row = offer as Record<string, unknown>;
    const amount = parseAmount(
      typeof row.total_amount === "string" ? row.total_amount : undefined,
      typeof row.total_currency === "string" ? row.total_currency : undefined,
    );
    if (amount > 0 && amount < bestAmount) { bestAmount = amount; best = row; }
  }
  if (!best) return null;
  return {
    offerId: typeof best.id === "string" ? best.id : undefined,
    origin: "",
    destination: "",
    departureDate: "",
    cabinClass: "economy",
    totalAmountUsd: bestAmount,
    currency: typeof best.total_currency === "string" ? best.total_currency : "USD",
    airline: extractAirline(best),
    stops: countStops(best),
    flightNumber: extractFlightNumber(best),
  };
}

async function fetchOfferForRoute(
  token: string,
  origin: string,
  destination: string,
  departureDate: string,
  cabinClass: "economy" | "premium_economy" | "business" | "first",
): Promise<DuffelFlightQuote | null> {
  const redis = getSafeRedisClient("duffel-cache");
  const key = cacheKey(origin, destination, departureDate, cabinClass);

  // Cache check
  if (redis) {
    try {
      const cached = await redis.get<DuffelFlightQuote | null>(key);
      if (cached) {
        logger.info("Duffel cache hit", { scope: "providers/duffel", origin, destination });
        return { ...cached, origin, destination, departureDate, cabinClass };
      }
    } catch { /* non-fatal */ }
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Duffel-Version": "v2",
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // STEP 1: Create offer request (returns in <1s)
  let offerRequestId: string;
  let inlineOffers: unknown[] | null = null;
  try {
    const ctrl1 = new AbortController();
    const t1 = setTimeout(() => ctrl1.abort(), 5_000);
    const r1 = await fetch(OFFER_REQUEST_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        data: {
          cabin_class: cabinClass,
          return_offers: true, // get offers inline on first call
          slices: [{ origin, destination, departure_date: departureDate }],
          passengers: [{ type: "adult" }],
          max_connections: 1,
        },
      }),
      signal: ctrl1.signal,
      cache: "no-store",
    });
    clearTimeout(t1);

    if (!r1.ok) {
      const body = await r1.text().catch(() => "");
      logger.warn("Duffel POST failed", { scope: "providers/duffel", origin, destination, status: r1.status, body: body.slice(0, 200) });
      return null;
    }

    const payload = (await r1.json()) as { data?: { id?: string; offers?: unknown[] } };
    offerRequestId = payload.data?.id ?? "";
    inlineOffers = payload.data?.offers ?? null;
  } catch (err) {
    logger.warn("Duffel POST error", { scope: "providers/duffel", origin, destination, err: err instanceof Error ? err.message : "unknown" });
    return null;
  }

  // Use inline offers if we got them
  let offers: unknown[] = Array.isArray(inlineOffers) && inlineOffers.length > 0 ? inlineOffers : [];

  // STEP 2: If no inline offers, poll GET endpoint (2s wait for airlines to respond)
  if (offers.length === 0 && offerRequestId) {
    await new Promise((r) => setTimeout(r, 2_000));
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 5_000);
      const r2 = await fetch(
        `${OFFERS_URL}?offer_request_id=${offerRequestId}&sort=total_amount&limit=10`,
        { headers, signal: ctrl2.signal, cache: "no-store" }
      );
      clearTimeout(t2);
      if (r2.ok) {
        const payload2 = (await r2.json()) as { data?: unknown[] };
        offers = Array.isArray(payload2.data) ? payload2.data : [];
      }
    } catch { /* non-fatal — use empty */ }
  }

  if (offers.length === 0) return null;

  const result = bestOffer(offers);
  if (!result) return null;

  const finalResult = { ...result, origin, destination, departureDate, cabinClass };

  // Cache for 15 minutes
  if (redis) {
    try { await redis.set(key, finalResult, { ex: CACHE_TTL_SECONDS }); } catch { /* non-fatal */ }
  }

  return finalResult;
}

export async function searchDuffelCashQuotes(input: {
  origins: string[];
  destination: string;
  departureDate: string;
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
}): Promise<DuffelSearchResult> {
  const token = resolveDuffelToken();
  if (!token) return { configured: false, quotes: [] };
  if (!input.destination || input.destination.length < 2) return { configured: true, quotes: [] };

  const cabin = input.cabinClass ?? "economy";
  const origins = [...new Set(input.origins.map((o) => o.toUpperCase()))].slice(0, MAX_ORIGINS);

  const results = await Promise.all(
    origins.map((origin) =>
      fetchOfferForRoute(token, origin, input.destination.toUpperCase(), input.departureDate, cabin)
        .catch(() => null)
    )
  );

  return { configured: true, quotes: results.filter((r): r is DuffelFlightQuote => r !== null) };
}
