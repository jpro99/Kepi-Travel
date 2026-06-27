import type { ResolvedHotelDestination } from "@/lib/hotels/resolveDestination";
import type { HotelSearchResult } from "@/lib/hotels/types";

const LITEAPI_BASE = "https://api.liteapi.travel/v3.0";

function resolveLiteApiKey(): string | null {
  return process.env.LITEAPI_KEY?.trim() || process.env.LITE_API_KEY?.trim() || null;
}

interface LiteApiHotelMeta {
  id?: string;
  hotelId?: string;
  name?: string;
  starRating?: number;
  rating?: number;
  address?: string;
  main_photo?: string;
  thumbnail?: string;
  images?: string[];
  chain?: string;
  hotelFacilities?: string[];
}

interface LiteApiRateRow {
  hotelId: string;
  roomTypes?: Array<{
    rates?: Array<{
      name?: string;
      boardName?: string;
      retailRate?: {
        total?: Array<{ amount?: number; currency?: string }>;
      };
      cancellationPolicies?: { refundableTag?: string };
    }>;
  }>;
}

function pickCheapestTotal(rateRow: LiteApiRateRow): { total: number; currency: string; roomName?: string } | null {
  let best: { total: number; currency: string; roomName?: string } | null = null;

  for (const roomType of rateRow.roomTypes ?? []) {
    for (const rate of roomType.rates ?? []) {
      const totalEntry = rate.retailRate?.total?.[0];
      const amount = totalEntry?.amount;
      if (amount === undefined || !Number.isFinite(amount) || amount <= 0) continue;
      const currency = totalEntry?.currency ?? "USD";
      if (!best || amount < best.total) {
        best = { total: amount, currency, roomName: rate.name ?? rate.boardName };
      }
    }
  }

  return best;
}

function mapLiteApiToHotel(input: {
  rateRow: LiteApiRateRow;
  meta: LiteApiHotelMeta | undefined;
  nights: number;
  resolved: ResolvedHotelDestination;
  checkIn: string;
  checkOut: string;
  rooms: number;
  guests: number;
}): HotelSearchResult | null {
  const pricing = pickCheapestTotal(input.rateRow);
  if (!pricing) return null;

  const hotelId = input.rateRow.hotelId;
  const photos: string[] = [];
  if (input.meta?.main_photo) photos.push(input.meta.main_photo);
  if (input.meta?.thumbnail && !photos.includes(input.meta.thumbnail)) photos.push(input.meta.thumbnail);
  for (const image of input.meta?.images ?? []) {
    if (image && !photos.includes(image)) photos.push(image);
    if (photos.length >= 4) break;
  }

  const amenities = (input.meta?.hotelFacilities ?? []).slice(0, 8);

  return {
    id: `liteapi-${hotelId}`,
    name: input.meta?.name?.trim() || `Hotel ${hotelId}`,
    chainName: input.meta?.chain,
    stars: Number(input.meta?.starRating ?? 3),
    rating: input.meta?.rating ? Number(input.meta.rating) : undefined,
    pricePerNight: pricing.total / input.nights,
    totalPrice: pricing.total,
    currency: pricing.currency,
    nights: input.nights,
    address: input.meta?.address ?? input.resolved.displayName,
    city: input.resolved.displayName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    amenities,
    photos,
    rooms: input.rooms,
    guests: input.guests,
    cancellable: true,
  };
}

/** Live hotel rates via LiteAPI / Nuitée (server-side only). */
export async function searchLiteApiHotels(input: {
  resolved: ResolvedHotelDestination;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  rooms: number;
  iata?: string;
}): Promise<{ hotels: HotelSearchResult[]; error?: string }> {
  const apiKey = resolveLiteApiKey();
  if (!apiKey) {
    return { hotels: [], error: "LiteAPI not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28_000);

  const body: Record<string, unknown> = {
    occupancies: [{ adults: Math.max(1, input.guests) }],
    currency: "USD",
    guestNationality: "US",
    checkin: input.checkIn,
    checkout: input.checkOut,
    maxRatesPerHotel: 2,
    roomMapping: true,
    includeHotelData: true,
    limit: 30,
    minRating: 3,
  };

  if (input.iata && input.iata.length === 3) {
    body.iataCode = input.iata.toUpperCase();
  } else {
    body.latitude = input.resolved.lat;
    body.longitude = input.resolved.lng;
    body.radius = 12_000;
  }

  try {
    const response = await fetch(`${LITEAPI_BASE}/hotels/rates`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      return {
        hotels: [],
        error: err.message ?? err.error ?? `LiteAPI search failed (${response.status})`,
      };
    }

    const payload = (await response.json()) as {
      data?: LiteApiRateRow[];
      hotels?: LiteApiHotelMeta[];
    };

    const metaById = new Map<string, LiteApiHotelMeta>();
    for (const hotel of payload.hotels ?? []) {
      const id = hotel.hotelId ?? hotel.id;
      if (id) metaById.set(id, hotel);
    }

    const hotels: HotelSearchResult[] = [];
    for (const rateRow of payload.data ?? []) {
      const mapped = mapLiteApiToHotel({
        rateRow,
        meta: metaById.get(rateRow.hotelId),
        nights: input.nights,
        resolved: input.resolved,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        rooms: input.rooms,
        guests: input.guests,
      });
      if (mapped) hotels.push(mapped);
      if (hotels.length >= 30) break;
    }

    if (hotels.length === 0) {
      return { hotels: [], error: "No LiteAPI rates for this destination and dates." };
    }

    return { hotels };
  } catch (error) {
    return {
      hotels: [],
      error: error instanceof Error ? error.message : "LiteAPI search failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function isLiteApiConfigured(): boolean {
  return Boolean(resolveLiteApiKey());
}
