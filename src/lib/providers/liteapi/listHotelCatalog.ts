import type { ResolvedHotelDestination } from "@/lib/hotels/resolveDestination";
import { cityFromAddress } from "@/lib/hotels/hotelCityScope";
import type { HotelSearchResult } from "@/lib/hotels/types";
import { resolveLiteApiKey } from "@/lib/providers/liteapi/searchHotels";

const LITEAPI_BASE = "https://api.liteapi.travel/v3.0";

interface LiteApiCatalogRow {
  id?: string;
  name?: string;
  starRating?: number;
  rating?: number;
  address?: string;
  main_photo?: string;
  thumbnail?: string;
  chain?: string;
  hotelFacilities?: string[];
  latitude?: number;
  longitude?: number;
  location?: { latitude?: number; longitude?: number };
}

function parseCityCountry(displayName: string): { cityName: string; countryCode: string } {
  const parts = displayName.split(",").map((part) => part.trim()).filter(Boolean);
  const cityName = parts[0] || displayName;
  const countryPart = (parts[parts.length - 1] ?? "").toLowerCase();
  const countryMap: Record<string, string> = {
    italy: "IT",
    italia: "IT",
    it: "IT",
    usa: "US",
    "united states": "US",
    us: "US",
    uk: "GB",
    "united kingdom": "GB",
    france: "FR",
    spain: "ES",
    germany: "DE",
    greece: "GR",
    portugal: "PT",
  };
  const countryCode = countryMap[countryPart] ?? "IT";
  return { cityName, countryCode };
}

function mapCatalogRow(input: {
  row: LiteApiCatalogRow;
  resolved: ResolvedHotelDestination;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  guests: number;
}): HotelSearchResult | null {
  const hotelId = input.row.id?.trim();
  const name = input.row.name?.trim();
  if (!hotelId || !name) return null;

  const lat = input.row.latitude ?? input.row.location?.latitude;
  const lng = input.row.longitude ?? input.row.location?.longitude;
  const photos: string[] = [];
  if (input.row.main_photo) photos.push(input.row.main_photo);
  if (input.row.thumbnail && !photos.includes(input.row.thumbnail)) photos.push(input.row.thumbnail);

  return {
    id: `liteapi-catalog-${hotelId}`,
    name,
    chainName: input.row.chain,
    stars: Number(input.row.starRating ?? 3),
    rating: input.row.rating ? Number(input.row.rating) : undefined,
    pricePerNight: 0,
    totalPrice: 0,
    currency: "USD",
    nights: input.nights,
    address: input.row.address ?? input.resolved.displayName,
    city: cityFromAddress(input.row.address) || input.resolved.displayName.split(",")[0]?.trim() || input.resolved.displayName,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    amenities: (input.row.hotelFacilities ?? []).slice(0, 8),
    photos,
    rooms: input.rooms,
    guests: input.guests,
    cancellable: false,
    browseOnly: true,
    ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat: lat!, lng: lng! } : {}),
  };
}

/** Static hotel catalog (no live rates) — fills browse gaps in small towns. */
export async function listLiteApiHotelCatalog(input: {
  resolved: ResolvedHotelDestination;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  rooms: number;
  /** Geo radius in meters (min 1000). */
  radiusMeters?: number;
  /** Max properties to return (default 120). */
  maxResults?: number;
}): Promise<{ hotels: HotelSearchResult[]; error?: string }> {
  const apiKey = resolveLiteApiKey();
  if (!apiKey) {
    return { hotels: [], error: "LiteAPI not configured" };
  }

  const { cityName, countryCode } = parseCityCountry(input.resolved.displayName);
  const radiusMeters = Math.max(1000, input.radiusMeters ?? 8000);
  const maxResults = input.maxResults ?? 120;
  const pageSize = 200;
  const hotels: HotelSearchResult[] = [];
  const seenIds = new Set<string>();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);

  try {
    for (let offset = 0; offset < maxResults; offset += pageSize) {
      const limit = Math.min(pageSize, maxResults - offset);
      const params = new URLSearchParams({
        countryCode,
        cityName,
        latitude: String(input.resolved.lat),
        longitude: String(input.resolved.lng),
        distance: String(radiusMeters),
        offset: String(offset),
        limit: String(limit),
      });

      const response = await fetch(`${LITEAPI_BASE}/data/hotels?${params.toString()}`, {
        headers: {
          "X-API-Key": apiKey,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
        if (hotels.length === 0) {
          return {
            hotels: [],
            error: err.message ?? err.error ?? `LiteAPI catalog failed (${response.status})`,
          };
        }
        break;
      }

      const payload = (await response.json()) as { data?: LiteApiCatalogRow[] };
      const rows = payload.data ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        const mapped = mapCatalogRow({
          row,
          resolved: input.resolved,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          nights: input.nights,
          rooms: input.rooms,
          guests: input.guests,
        });
        if (!mapped || seenIds.has(mapped.id)) continue;
        seenIds.add(mapped.id);
        hotels.push(mapped);
        if (hotels.length >= maxResults) break;
      }

      if (hotels.length >= maxResults || rows.length < limit) break;
    }

    return { hotels };
  } catch (error) {
    return {
      hotels,
      error: error instanceof Error ? error.message : "LiteAPI catalog failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
