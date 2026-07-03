import type { ResolvedHotelDestination } from "@/lib/hotels/resolveDestination";
import { HOTEL_CITY_COORDS } from "@/lib/hotels/resolveDestination";
import type { HotelSearchResult } from "@/lib/hotels/types";
import { hasDisplayNightlyRate, hasKepiBookableLiveRate } from "@/lib/hotels/hotelLiveRate";
import { cityFromAddress, isSmallDestination } from "@/lib/hotels/hotelCityScope";
import {
  buildEstimatedStays,
  estimatedStaysNotice,
  resolveStaysMode,
} from "@/lib/providers/duffel/fallbackStays";
import { listLiteApiHotelCatalog } from "@/lib/providers/liteapi/listHotelCatalog";
import { isLiteApiConfigured, searchLiteApiHotels } from "@/lib/providers/liteapi/searchHotels";
import type { DuffelStayQuote } from "@/lib/providers/duffel/types";

export type HotelSearchSource = "duffel" | "liteapi" | "estimated";

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
    if (iata.length !== 3) continue;
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
  const photos = (prop.photos as { url: string }[] | undefined)?.map((entry) => entry.url).slice(0, 20) ?? [];
  const addressRecord = prop.address as Record<string, unknown> | undefined;
  const locationRecord = prop.location as Record<string, unknown> | undefined;
  const geo =
    (locationRecord?.geographic_coordinates as Record<string, unknown> | undefined) ??
    (prop.geographic_coordinates as Record<string, unknown> | undefined);
  const latRaw = geo?.latitude ?? geo?.lat;
  const lngRaw = geo?.longitude ?? geo?.lng;
  const lat = typeof latRaw === "number" ? latRaw : typeof latRaw === "string" ? Number.parseFloat(latRaw) : undefined;
  const lng = typeof lngRaw === "number" ? lngRaw : typeof lngRaw === "string" ? Number.parseFloat(lngRaw) : undefined;

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
    city: cityFromAddress((addressRecord?.line_one as string | undefined) ?? "") || resolved.displayName.split(",")[0]?.trim() || resolved.displayName,
    checkIn,
    checkOut,
    amenities,
    photos,
    rooms,
    guests,
    cancellable: Boolean((row as Record<string, unknown>).cheapest_rate_is_cancellable),
    cancellationDeadline: (row as Record<string, unknown>).cheapest_rate_cancellation_deadline as string | undefined,
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {}),
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
    pricePerNight: 0,
    totalPrice: 0,
    currency: quote.currency,
    nights,
    address: quote.area ?? resolved.displayName,
    city: cityFromAddress(quote.area) || resolved.displayName.split(",")[0]?.trim() || resolved.displayName,
    checkIn,
    checkOut,
    amenities: [],
    photos: quote.photoUrl ? [quote.photoUrl] : [],
    rooms,
    guests,
    cancellable: true,
    browseOnly: true,
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
            radius: 20,
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
    for (const row of results.slice(0, 80)) {
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
      if (hotels.length >= 80) break;
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

/** Duffel Stays → LiteAPI (multi-pass) → estimated fallback. */
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
  const duffel = mockMode
    ? { hotels: [], error: "Mock stays mode" }
    : await searchDuffelHotels(input);

  let merged = mergeHotelResults(duffel.hotels);
  let liteApiError = duffel.error;

  if (!mockMode && isLiteApiConfigured()) {
    const liteInput = {
      resolved: input.resolved,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      nights: input.nights,
      guests: input.guests,
      rooms: input.rooms,
    };

    const primary = await searchLiteApiHotels(liteInput, { limit: 150, radiusMeters: 12_000 });
    merged = mergeHotelResults(merged, primary.hotels);
    liteApiError = primary.error ?? liteApiError;

    if (isSmallDestination(input.resolved.displayName)) {
      for (const radius of [3_000, 6_000, 10_000, 18_000, 28_000]) {
        const batch = await searchLiteApiHotels(liteInput, { limit: 150, radiusMeters: radius });
        merged = mergeHotelResults(merged, batch.hotels);
        liteApiError = batch.error ?? liteApiError;
      }
    }

    if (merged.length < 40) {
      const wide = await searchLiteApiHotels(liteInput, {
        limit: 150,
        radiusMeters: 45_000,
      });
      merged = mergeHotelResults(merged, wide.hotels);
      liteApiError = wide.error ?? liteApiError;
    }

    const nearbyIata = pickFallbackIata(input.resolved);
    if (merged.length < 40 && nearbyIata) {
      const byAirport = await searchLiteApiHotels(liteInput, {
        limit: 150,
        forceIata: nearbyIata,
      });
      merged = mergeHotelResults(merged, byAirport.hotels);
      liteApiError = byAirport.error ?? liteApiError;
    }

    const liveCount = merged.filter((hotel) => hasKepiBookableLiveRate(hotel)).length;
    if (liveCount < 50) {
      for (const radius of [5_000, 8_000, 12_000, 20_000]) {
        const catalog = await listLiteApiHotelCatalog({
          ...liteInput,
          radiusMeters: radius,
          maxResults: 150,
        });
        merged = mergeHotelResults(merged, catalog.hotels);
        liteApiError = catalog.error ?? liteApiError;
        if (merged.length >= 50) break;
      }
    }
  }

  if (merged.length > 0) {
    const source: HotelSearchSource = duffel.hotels.length > 0 ? "duffel" : "liteapi";
    const notice =
      duffel.error?.includes("Stays not enabled") || duffel.error?.includes("403")
        ? "Live rates via LiteAPI. Duffel Stays is still pending on your account — not required for live search."
        : undefined;
    return {
      hotels: merged.slice(0, 150),
      source,
      notice,
      duffelError: duffel.error ?? liteApiError,
    };
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

  const notice = estimatedStaysNotice(duffel.error ?? liteApiError, mockMode);
  return {
    hotels,
    source: "estimated",
    notice,
    duffelError: duffel.error ?? liteApiError,
  };
}

function hotelIdentityKey(hotel: HotelSearchResult): string {
  const catalogMatch = hotel.id.match(/^liteapi-(?:catalog-)?(.+)$/);
  if (catalogMatch?.[1]) return `liteapi:${catalogMatch[1]}`;
  const name = hotel.name.trim().toLowerCase().replace(/\s+/g, " ");
  return `name:${name}`;
}

function mergeHotelEntry(existing: HotelSearchResult, incoming: HotelSearchResult): HotelSearchResult {
  const existingBookable = hasKepiBookableLiveRate(existing);
  const incomingBookable = hasKepiBookableLiveRate(incoming);

  if (!existingBookable && incomingBookable) return incoming;
  if (existingBookable && !incomingBookable) return existing;

  const existingLive = hasDisplayNightlyRate(existing);
  const incomingLive = hasDisplayNightlyRate(incoming);

  if (!existingLive && incomingLive) return incoming;
  if (existingLive && incomingLive && incoming.pricePerNight < existing.pricePerNight) {
    return {
      ...incoming,
      photos: incoming.photos.length > 0 ? incoming.photos : existing.photos,
      amenities: incoming.amenities.length > 0 ? incoming.amenities : existing.amenities,
      rateRoomName: incoming.rateRoomName ?? existing.rateRoomName,
    };
  }

  return {
    ...existing,
    photos: existing.photos.length > 0 ? existing.photos : incoming.photos,
    amenities: existing.amenities.length > 0 ? existing.amenities : incoming.amenities,
    rateRoomName: existing.rateRoomName ?? incoming.rateRoomName,
    bookOfferId: existing.bookOfferId ?? incoming.bookOfferId,
    bookProvider: existing.bookProvider ?? incoming.bookProvider,
  };
}

function mergeHotelResults(...groups: HotelSearchResult[][]): HotelSearchResult[] {
  const byIdentity = new Map<string, HotelSearchResult>();

  for (const group of groups) {
    for (const hotel of group) {
      const key = hotelIdentityKey(hotel);
      const existing = byIdentity.get(key);
      if (!existing) {
        byIdentity.set(key, hotel);
        continue;
      }
      byIdentity.set(key, mergeHotelEntry(existing, hotel));
    }
  }

  return [...byIdentity.values()].sort((a, b) => {
    const aLive = hasDisplayNightlyRate(a);
    const bLive = hasDisplayNightlyRate(b);
    if (aLive !== bLive) return aLive ? -1 : 1;
    if (aLive && bLive) return a.pricePerNight - b.pricePerNight;
    return (b.rating ?? b.stars) - (a.rating ?? a.stars);
  });
}
