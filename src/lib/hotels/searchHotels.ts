import type { ResolvedHotelDestination } from "@/lib/hotels/resolveDestination";
import { HOTEL_CITY_COORDS } from "@/lib/hotels/resolveDestination";
import type { HotelSearchResult } from "@/lib/hotels/types";
import {
  buildEstimatedStays,
  estimatedStaysNotice,
  resolveStaysMode,
} from "@/lib/providers/duffel/fallbackStays";
import type { DuffelStayQuote } from "@/lib/providers/duffel/types";

export type HotelSearchSource = "duffel" | "estimated";

export interface HotelSearchPayload {
  hotels: HotelSearchResult[];
  source: HotelSearchSource;
  notice?: string;
  duffelError?: string;
}

function resolveDuffelToken(): string | null {
  return process.env.DUFFEL_ACCESS_TOKEN?.trim() || null;
}

function pickFallbackIata(resolved: ResolvedHotelDestination): string {
  if (resolved.iata) return resolved.iata;

  let bestIata = "FCO";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [iata, hit] of Object.entries(HOTEL_CITY_COORDS)) {
    const distance = Math.hypot(hit.lat - resolved.lat, hit.lng - resolved.lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIata = iata;
    }
  }
  return bestIata;
}

function mapDuffelRowToHotel(input: {
  row: Record<string, unknown>;
  nights: number;
  resolved: ResolvedHotelDestination;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guests: number;
}): HotelSearchResult | null {
  const { row, nights, resolved, checkIn, checkOut, rooms, guests } = input;
  const prop = (row.property ?? row.accommodation) as Record<string, unknown> | undefined;
  const rateRaw = row.cheapest_rate_total_amount;
  const total =
    typeof rateRaw === "number"
      ? rateRaw
      : typeof rateRaw === "string"
        ? Number.parseFloat(rateRaw)
        : Number.NaN;
  if (!prop || !Number.isFinite(total) || total <= 0) return null;

  const amenities = (prop.amenities as { type: string }[] | undefined)?.map((entry) => entry.type).slice(0, 8) ?? [];
  const photos = (prop.photos as { url: string }[] | undefined)?.map((entry) => entry.url).slice(0, 4) ?? [];
  const addressRecord = prop.address as Record<string, unknown> | undefined;

  return {
    id: row.id as string,
    name: (prop.name ?? "Unknown Hotel") as string,
    chainName: prop.chain_name as string | undefined,
    stars: Number(prop.star_rating ?? 3),
    rating: prop.review_score ? Number(prop.review_score) : undefined,
    ratingCount: prop.review_count as number | undefined,
    pricePerNight: total / nights,
    totalPrice: total,
    currency: (row.cheapest_rate_currency ?? "USD") as string,
    nights,
    address: (addressRecord?.line_one as string | undefined) ?? "",
    city: resolved.displayName,
    checkIn,
    checkOut,
    amenities,
    photos,
    rooms,
    guests,
    cancellable: Boolean((row as Record<string, unknown>).cheapest_rate_is_cancellable),
    cancellationDeadline: (row as Record<string, unknown>).cheapest_rate_cancellation_deadline as string | undefined,
  };
}

function mapEstimatedQuoteToHotel(input: {
  quote: DuffelStayQuote;
  nights: number;
  resolved: ResolvedHotelDestination;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guests: number;
}): HotelSearchResult {
  const { quote, nights, resolved, checkIn, checkOut, rooms, guests } = input;
  return {
    id: quote.id,
    name: quote.name,
    chainName: quote.chainName,
    stars: quote.ratingStars ?? 3,
    rating: quote.reviewScore,
    pricePerNight: quote.nightlyUsd,
    totalPrice: quote.totalAmountUsd,
    currency: quote.currency,
    nights,
    address: quote.area ?? resolved.displayName,
    city: resolved.displayName,
    checkIn,
    checkOut,
    amenities: [],
    photos: quote.photoUrl ? [quote.photoUrl] : [],
    rooms,
    guests,
    cancellable: true,
  };
}

async function searchDuffelHotels(input: {
  resolved: ResolvedHotelDestination;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  rooms: number;
}): Promise<{ hotels: HotelSearchResult[]; error?: string }> {
  const token = resolveDuffelToken();
  if (!token) {
    return { hotels: [], error: "Hotels not configured" };
  }

  const guestList = Array.from({ length: input.guests }, () => ({ type: "adult" }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch("https://api.duffel.com/stays/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        data: {
          rooms: input.rooms,
          guests: guestList,
          check_in_date: input.checkIn,
          check_out_date: input.checkOut,
          location: {
            geographic_coordinates: {
              latitude: input.resolved.lat,
              longitude: input.resolved.lng,
            },
            radius: 10,
            distance_unit: "km",
          },
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as {
        errors?: Array<{ message?: string }>;
      };
      const duffelMessage = err.errors?.[0]?.message;
      if (response.status === 403 || response.status === 404) {
        return {
          hotels: [],
          error: duffelMessage ?? "Stays not enabled on this Duffel account yet.",
        };
      }
      return {
        hotels: [],
        error: duffelMessage ?? "Hotel search failed",
      };
    }

    const data = (await response.json()) as { data?: { results?: Record<string, unknown>[] } };
    const results = data?.data?.results ?? [];
    const hotels: HotelSearchResult[] = [];
    for (const row of results.slice(0, 30)) {
      const mapped = mapDuffelRowToHotel({
        row,
        nights: input.nights,
        resolved: input.resolved,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        rooms: input.rooms,
        guests: input.guests,
      });
      if (mapped) hotels.push(mapped);
      if (hotels.length >= 20) break;
    }

    if (hotels.length === 0 && results.length > 0) {
      return { hotels: [], error: "No live rates returned for these dates." };
    }
    if (hotels.length === 0) {
      return { hotels: [], error: "No hotels returned for this destination." };
    }

    return { hotels };
  } catch (error) {
    return {
      hotels: [],
      error: error instanceof Error ? error.message : "Search failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Live Duffel Stays when enabled; otherwise estimated rates so the Hotels tab still works. */
export async function searchHotelsLiveOrEstimated(input: {
  resolved: ResolvedHotelDestination;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  rooms: number;
  chainPriority: string[];
}): Promise<HotelSearchPayload> {
  const mockMode = resolveStaysMode() === "mock";
  const live = mockMode
    ? { hotels: [], error: "Mock stays mode" }
    : await searchDuffelHotels(input);

  if (live.hotels.length > 0) {
    return { hotels: live.hotels, source: "duffel" };
  }

  const fallbackIata = pickFallbackIata(input.resolved);
  const estimated = buildEstimatedStays({
    destinationIata: fallbackIata,
    destinationCity: input.resolved.displayName.split(",")[0]?.trim() || input.resolved.displayName,
    nights: input.nights,
    chainPriority: input.chainPriority,
  });

  const hotels = estimated.map((quote) =>
    mapEstimatedQuoteToHotel({
      quote,
      nights: input.nights,
      resolved: input.resolved,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
      guests: input.guests,
    }),
  );

  const notice = estimatedStaysNotice(live.error, mockMode);
  return {
    hotels,
    source: "estimated",
    notice,
    duffelError: live.error,
  };
}
