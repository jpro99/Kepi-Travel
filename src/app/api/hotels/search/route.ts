import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// City → coordinates for Duffel Stays search
const CITY_COORDS: Record<string, { lat: number; lng: number; name: string }> = {
  // US
  LAX: { lat: 34.0522, lng: -118.2437, name: "Los Angeles" },
  ONT: { lat: 34.0633, lng: -117.6509, name: "Ontario / Beaumont" },
  SNA: { lat: 33.6846, lng: -117.8265, name: "Orange County" },
  JFK: { lat: 40.7128, lng: -74.0060, name: "New York" },
  NYC: { lat: 40.7128, lng: -74.0060, name: "New York" },
  ORD: { lat: 41.8781, lng: -87.6298, name: "Chicago" },
  MIA: { lat: 25.7617, lng: -80.1918, name: "Miami" },
  LAS: { lat: 36.1699, lng: -115.1398, name: "Las Vegas" },
  SFO: { lat: 37.7749, lng: -122.4194, name: "San Francisco" },
  SEA: { lat: 47.6062, lng: -122.3321, name: "Seattle" },
  DEN: { lat: 39.7392, lng: -104.9903, name: "Denver" },
  BOS: { lat: 42.3601, lng: -71.0589, name: "Boston" },
  MCO: { lat: 28.5383, lng: -81.3792, name: "Orlando" },
  HNL: { lat: 21.3069, lng: -157.8583, name: "Honolulu" },
  // Europe
  BRI: { lat: 41.1177, lng: 16.8512, name: "Bari" },
  FCO: { lat: 41.9028, lng: 12.4964, name: "Rome" },
  MXP: { lat: 45.4642, lng: 9.1900, name: "Milan" },
  VCE: { lat: 45.4408, lng: 12.3155, name: "Venice" },
  NAP: { lat: 40.8518, lng: 14.2681, name: "Naples" },
  FLR: { lat: 43.7696, lng: 11.2558, name: "Florence" },
  MUC: { lat: 48.1351, lng: 11.5820, name: "Munich" },
  FRA: { lat: 50.1109, lng: 8.6821, name: "Frankfurt" },
  BER: { lat: 52.5200, lng: 13.4050, name: "Berlin" },
  LHR: { lat: 51.5074, lng: -0.1278, name: "London" },
  CDG: { lat: 48.8566, lng: 2.3522, name: "Paris" },
  MAD: { lat: 40.4168, lng: -3.7038, name: "Madrid" },
  BCN: { lat: 41.3851, lng: 2.1734, name: "Barcelona" },
  AMS: { lat: 52.3676, lng: 4.9041, name: "Amsterdam" },
  ATH: { lat: 37.9838, lng: 23.7275, name: "Athens" },
  LIS: { lat: 38.7169, lng: -9.1399, name: "Lisbon" },
  NCE: { lat: 43.7102, lng: 7.2620, name: "Nice" },
  // Asia/Pacific
  NRT: { lat: 35.6762, lng: 139.6503, name: "Tokyo" },
  SYD: { lat: -33.8688, lng: 151.2093, name: "Sydney" },
  // Americas
  CUN: { lat: 21.1619, lng: -86.8515, name: "Cancún" },
};

export interface HotelResult {
  id: string;
  name: string;
  chainName?: string;
  stars: number;
  rating?: number;
  ratingCount?: number;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  nights: number;
  address: string;
  city: string;
  checkIn: string;
  checkOut: string;
  amenities: string[];
  photos: string[];
  rooms: number;
  guests: number;
  cancellable: boolean;
  cancellationDeadline?: string;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { destination, checkIn, checkOut, guests = 1, rooms = 1 } = body;

  if (!destination || !checkIn || !checkOut) {
    return NextResponse.json({ error: "Missing destination, check-in, or check-out date" }, { status: 400 });
  }

  const token = process.env.DUFFEL_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "Hotels not configured" }, { status: 500 });

  // Resolve destination to coordinates
  const destKey = destination.toUpperCase().slice(0, 3);
  const coords = CITY_COORDS[destKey] ?? CITY_COORDS[destination.toUpperCase()];

  if (!coords) {
    return NextResponse.json({
      error: `We don't have coordinates for "${destination}" yet. Try using the airport code (e.g. BRI, JFK, MUC).`,
      status: 400
    });
  }

  const nights = Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000
  );

  if (nights <= 0) {
    return NextResponse.json({ error: "Check-out must be after check-in" }, { status: 400 });
  }

  const guestList = Array.from({ length: Number(guests) }, () => ({ type: "adult" }));

  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 25_000);

    const res = await fetch("https://api.duffel.com/stays/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          rooms: Number(rooms),
          guests: guestList,
          check_in_date: checkIn,
          check_out_date: checkOut,
          location: {
            geographic_coordinates: {
              latitude: coords.lat,
              longitude: coords.lng,
            },
            radius: 10,
            distance_unit: "km",
          },
        }
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: "Hotel search failed", detail: err }, { status: 502 });
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = (data?.data?.results ?? []) as Record<string, unknown>[];

    const hotels: HotelResult[] = results.slice(0, 10).map(r => {
      const prop = r.property as Record<string, unknown>;
      const rate = r.cheapest_rate_total_amount as string;
      const amenities = (prop.amenities as { type: string }[] ?? []).map(a => a.type).slice(0, 8);
      const photos = (prop.photos as { url: string }[] ?? []).map(p => p.url).slice(0, 4);

      return {
        id: r.id as string,
        name: (prop.name ?? "Unknown Hotel") as string,
        chainName: prop.chain_name as string | undefined,
        stars: Number(prop.star_rating ?? 3),
        rating: prop.review_score ? Number(prop.review_score) : undefined,
        ratingCount: prop.review_count as number | undefined,
        pricePerNight: Number(rate) / nights,
        totalPrice: Number(rate),
        currency: (r.cheapest_rate_currency ?? "USD") as string,
        nights,
        address: (prop.address as Record<string, unknown>)?.line_one as string ?? "",
        city: coords.name,
        checkIn,
        checkOut,
        amenities,
        photos,
        rooms: Number(rooms),
        guests: Number(guests),
        cancellable: Boolean((r as Record<string, unknown>).cheapest_rate_is_cancellable),
        cancellationDeadline: (r as Record<string, unknown>).cheapest_rate_cancellation_deadline as string | undefined,
      };
    });

    return NextResponse.json({ hotels, total: results.length, city: coords.name });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
