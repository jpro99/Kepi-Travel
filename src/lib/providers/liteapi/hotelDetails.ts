import { parseLiteApiHotelDetailMedia, type HotelDetailMedia } from "@/lib/hotels/hotelMedia";
import { resolveLiteApiKey } from "@/lib/providers/liteapi/searchHotels";

const LITEAPI_BASE = "https://api.liteapi.travel/v3.0";

export async function fetchLiteApiHotelDetails(hotelId: string): Promise<{
  media: HotelDetailMedia | null;
  error?: string;
}> {
  const apiKey = resolveLiteApiKey();
  if (!apiKey) {
    return { media: null, error: "LiteAPI not configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const params = new URLSearchParams({ hotelId });
    const response = await fetch(`${LITEAPI_BASE}/data/hotel?${params.toString()}`, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      return {
        media: null,
        error: err.message ?? err.error ?? `Hotel details failed (${response.status})`,
      };
    }

    const payload = (await response.json()) as { data?: Record<string, unknown> };
    if (!payload.data) {
      return { media: null, error: "Hotel not found" };
    }

    return { media: parseLiteApiHotelDetailMedia(payload.data) };
  } catch (error) {
    return {
      media: null,
      error: error instanceof Error ? error.message : "Hotel details failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
