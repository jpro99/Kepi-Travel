import type { DuffelFlightQuote, DuffelSearchResult } from "@/lib/providers/duffel/types";
import { logger } from "@/lib/logger";

const DUFFEL_API = "https://api.duffel.com/air/offer_requests";
const TIMEOUT_MS = 18_000;
const MAX_ORIGINS = 3;

function resolveDuffelToken(): string | null {
  return process.env.DUFFEL_ACCESS_TOKEN?.trim() || null;
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
  let stops = 0;
  for (const slice of slices) {
    if (!slice || typeof slice !== "object") continue;
    const segments = (slice as Record<string, unknown>).segments;
    if (Array.isArray(segments) && segments.length > 1) {
      stops += segments.length - 1;
    }
  }
  return stops;
}

function airlineName(offer: Record<string, unknown>): string {
  const owner = offer.owner;
  if (owner && typeof owner === "object" && typeof (owner as Record<string, unknown>).name === "string") {
    return (owner as Record<string, unknown>).name as string;
  }
  return "Airline";
}

async function fetchOfferForRoute(
  token: string,
  origin: string,
  destination: string,
  departureDate: string,
  cabinClass: "economy" | "premium_economy" | "business" | "first",
): Promise<DuffelFlightQuote | null> {
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
          return_offers: true,
          slices: [
            {
              origin,
              destination,
              departure_date: departureDate,
            },
          ],
          passengers: [{ type: "adult" }],
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn("Duffel offer request failed", {
        scope: "providers/duffel",
        origin,
        destination,
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

    if (!best || !Number.isFinite(bestAmount)) return null;

    return {
      origin,
      destination,
      departureDate,
      totalAmountUsd: Math.round(bestAmount * 100) / 100,
      currency: typeof best.total_currency === "string" ? best.total_currency : "USD",
      airline: airlineName(best),
      cabinClass,
      stops: countStops(best),
      offerId: typeof best.id === "string" ? best.id : "",
    };
  } catch (error) {
    logger.warn("Duffel offer request error", {
      scope: "providers/duffel",
      origin,
      destination,
      error: error instanceof Error ? error.message : "unknown",
    });
    return null;
  } finally {
    clearTimeout(timer);
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

  const cabin = input.cabinClass ?? "economy";
  const origins = [...new Set(input.origins.map((o) => o.toUpperCase()))].slice(0, MAX_ORIGINS);

  const results = await Promise.all(
    origins.map((origin) =>
      fetchOfferForRoute(token, origin, input.destination.toUpperCase(), input.departureDate, cabin),
    ),
  );

  const quotes = results.filter((q): q is DuffelFlightQuote => q !== null);
  quotes.sort((a, b) => a.totalAmountUsd - b.totalAmountUsd);

  return {
    configured: true,
    quotes,
    error: quotes.length === 0 ? "No Duffel offers returned for these routes." : undefined,
  };
}
