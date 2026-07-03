import { parseLiteApiCancellationPolicies } from "@/lib/hotels/hotelCancellation";
import { readLiteApiErrorMessage } from "@/lib/providers/liteapi/readLiteApiError";
import { cityFromAddress } from "@/lib/hotels/hotelCityScope";
import type { HotelSearchResult } from "@/lib/hotels/types";

const LITEAPI_BASE = "https://api.liteapi.travel/v3.0";

export function resolveLiteApiKey(): string | null {
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
  latitude?: number;
  longitude?: number;
}

interface LiteApiRateRow {
  hotelId: string;
  roomTypes?: Array<{
    rates?: Array<{
      offerId?: string;
      rateId?: string;
      id?: string;
      name?: string;
      boardName?: string;
      retailRate?: {
        total?: Array<{ amount?: number; currency?: string }>;
      };
      cancellationPolicies?: { refundableTag?: string };
      suggestedSellingPrice?: { amount?: number; currency?: string; source?: string } | Array<{ amount?: number; source?: string }>;
    }>;
  }>;
}

type LiteApiPickedRate = {
  total: number;
  currency: string;
  offerId: string;
  roomName?: string;
  cancellationPolicies?: unknown;
  referenceTotalUsd?: number;
  referencePriceSource?: string;
};

function readSuggestedSellingTotal(raw: unknown): { total: number; source?: string } | null {
  if (!raw) return null;
  const entry = Array.isArray(raw) ? raw[0] : raw;
  if (!entry || typeof entry !== "object") return null;
  const record = entry as { amount?: number; source?: string };
  if (typeof record.amount !== "number" || !Number.isFinite(record.amount) || record.amount <= 0) {
    return null;
  }
  return { total: record.amount, source: typeof record.source === "string" ? record.source : undefined };
}

function collectBookableRates(rateRow: LiteApiRateRow): LiteApiPickedRate[] {
  const rates: LiteApiPickedRate[] = [];

  for (const roomType of rateRow.roomTypes ?? []) {
    for (const rate of roomType.rates ?? []) {
      const offerId = rate.offerId ?? rate.rateId ?? rate.id;
      if (!offerId?.trim()) continue;
      const totalEntry = rate.retailRate?.total?.[0];
      const amount = totalEntry?.amount;
      if (amount === undefined || !Number.isFinite(amount) || amount <= 0) continue;
      const reference = readSuggestedSellingTotal(rate.suggestedSellingPrice);
      rates.push({
        total: amount,
        currency: totalEntry?.currency ?? "USD",
        offerId: offerId.trim(),
        roomName: rate.name ?? rate.boardName,
        cancellationPolicies: rate.cancellationPolicies,
        referenceTotalUsd: reference?.total,
        referencePriceSource: reference?.source,
      });
    }
  }

  return rates;
}

/** Prefer standard/flexible room types so chain-site comparisons are closer. */
export function pickDisplayRate(rateRow: LiteApiRateRow): LiteApiPickedRate | null {
  const rates = collectBookableRates(rateRow);
  if (rates.length === 0) return null;
  if (rates.length === 1) return rates[0];

  const standardLike = rates.filter((rate) => {
    const name = (rate.roomName ?? "").toLowerCase();
    return /standard|classic|flexible|best available|superior|deluxe king|deluxe queen/.test(name);
  });

  const restricted = (rate: LiteApiPickedRate) =>
    /advance|prepay|pre-pay|non.?refund|room only|restricted|saver|basic economy/.test(
      (rate.roomName ?? "").toLowerCase(),
    );

  const pool =
    standardLike.length > 0
      ? standardLike
      : rates.filter((rate) => !restricted(rate)).length > 0
        ? rates.filter((rate) => !restricted(rate))
        : rates;

  return pool.reduce((best, rate) => (!best || rate.total < best.total ? rate : best));
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
  const pricing = pickDisplayRate(input.rateRow);
  if (!pricing) return null;

  const hotelId = input.rateRow.hotelId;
  const photos: string[] = [];
  if (input.meta?.main_photo) photos.push(input.meta.main_photo);
  if (input.meta?.thumbnail && !photos.includes(input.meta.thumbnail)) photos.push(input.meta.thumbnail);
  for (const image of input.meta?.images ?? []) {
    if (image && !photos.includes(image)) photos.push(image);
    if (photos.length >= 20) break;
  }

  const amenities = (input.meta?.hotelFacilities ?? []).slice(0, 8);
  const cancellation = parseLiteApiCancellationPolicies(pricing.cancellationPolicies);

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
    city: cityFromAddress(input.meta?.address) || input.resolved.displayName.split(",")[0]?.trim() || input.resolved.displayName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    amenities,
    photos,
    rooms: input.rooms,
    guests: input.guests,
    cancellable: cancellation?.cancellable ?? true,
    cancellationDeadline: cancellation?.deadline,
    bookProvider: "liteapi",
    bookOfferId: pricing.offerId,
    rateRoomName: pricing.roomName,
    referenceTotalUsd: pricing.referenceTotalUsd,
    referencePriceSource: pricing.referencePriceSource,
    ...(Number.isFinite(input.meta?.latitude) && Number.isFinite(input.meta?.longitude)
      ? { lat: input.meta!.latitude!, lng: input.meta!.longitude! }
      : {}),
  };
}

export interface LiteApiSearchOptions {
  /** Max properties to return (default 120). */
  limit?: number;
  /** Geo radius in meters when searching by lat/lng (default 25_000). */
  radiusMeters?: number;
  /** Minimum guest rating filter; omit for no filter. */
  minRating?: number;
  /** Force IATA search instead of coordinates. */
  forceIata?: string;
}

/** Live hotel rates via LiteAPI / Nuitée (server-side only). */
export async function searchLiteApiHotels(
  input: {
    resolved: ResolvedHotelDestination;
    checkIn: string;
    checkOut: string;
    nights: number;
    guests: number;
    rooms: number;
    iata?: string;
  },
  options: LiteApiSearchOptions = {},
): Promise<{ hotels: HotelSearchResult[]; error?: string }> {
  const apiKey = resolveLiteApiKey();
  if (!apiKey) {
    return { hotels: [], error: "LiteAPI not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28_000);

  const limit = options.limit ?? 120;
  const radiusMeters = options.radiusMeters ?? 25_000;
  const forcedIata = options.forceIata?.trim().toUpperCase();
  const searchIata = forcedIata || (input.iata && input.iata.length === 3 ? input.iata.toUpperCase() : null);

  const body: Record<string, unknown> = {
    occupancies: [{ adults: Math.max(1, input.guests) }],
    currency: "USD",
    guestNationality: "US",
    checkin: input.checkIn,
    checkout: input.checkOut,
    maxRatesPerHotel: 12,
    roomMapping: true,
    includeHotelData: true,
    limit,
  };

  if (options.minRating !== undefined) {
    body.minRating = options.minRating;
  }

  if (searchIata) {
    body.iataCode = searchIata;
  } else {
    body.latitude = input.resolved.lat;
    body.longitude = input.resolved.lng;
    body.radius = radiusMeters;
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
      const err = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return {
        hotels: [],
        error: readLiteApiErrorMessage(err, `LiteAPI search failed (${response.status})`),
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
      if (hotels.length >= limit) break;
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
