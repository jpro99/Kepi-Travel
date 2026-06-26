import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rankHotelSearchResults } from "@/lib/hotels/intelligentRanking";
import { resolveHotelDestination } from "@/lib/hotels/resolveDestination";
import type { HotelSearchResult, RankedHotelSearchResult } from "@/lib/hotels/types";
import { getHotelStayMemory, learnFromHotelEvent, saveHotelStayMemory, summarizeHotelMemory } from "@/lib/memory/hotelMemory";
import { normalizeLoyaltyBalances } from "@/lib/loyalty/walletBalances";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type { HotelSearchResult, RankedHotelSearchResult };

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

  const resolved = await resolveHotelDestination(String(destination));
  if (!resolved) {
    return NextResponse.json(
      {
        error: `Could not find "${destination}". Try a city name (e.g. Rome, Italy) or airport code (e.g. FCO, JFK).`,
      },
      { status: 400 },
    );
  }

  const nights = Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000);

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
        Authorization: `Bearer ${token}`,
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
              latitude: resolved.lat,
              longitude: resolved.lng,
            },
            radius: 10,
            distance_unit: "km",
          },
        },
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        errors?: Array<{ message?: string }>;
      };
      const duffelMessage = err.errors?.[0]?.message;
      const hint =
        res.status === 403 || res.status === 404
          ? "Hotel search is not enabled on this booking account yet."
          : res.status === 422
            ? "Those dates or destination are not valid for hotel search."
            : "Hotel search failed — try different dates or a nearby city.";
      return NextResponse.json(
        { error: duffelMessage ?? hint, detail: err },
        { status: 502 },
      );
    }

    const data = await res.json();
    const results: Record<string, unknown>[] = (data?.data?.results ?? []) as Record<string, unknown>[];

    const hotels: HotelSearchResult[] = [];
    for (const row of results.slice(0, 30)) {
      const prop = (row.property ?? row.accommodation) as Record<string, unknown> | undefined;
      const rateRaw = row.cheapest_rate_total_amount;
      const total =
        typeof rateRaw === "number"
          ? rateRaw
          : typeof rateRaw === "string"
            ? Number.parseFloat(rateRaw)
            : Number.NaN;
      if (!prop || !Number.isFinite(total) || total <= 0) continue;

      const name = (prop.name ?? "Unknown Hotel") as string;
      const amenities = (prop.amenities as { type: string }[] | undefined)?.map((entry) => entry.type).slice(0, 8) ?? [];
      const photos = (prop.photos as { url: string }[] | undefined)?.map((entry) => entry.url).slice(0, 4) ?? [];
      const addressRecord = prop.address as Record<string, unknown> | undefined;

      hotels.push({
        id: row.id as string,
        name,
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
        rooms: Number(rooms),
        guests: Number(guests),
        cancellable: Boolean((row as Record<string, unknown>).cheapest_rate_is_cancellable),
        cancellationDeadline: (row as Record<string, unknown>).cheapest_rate_cancellation_deadline as string | undefined,
      });
      if (hotels.length >= 20) break;
    }

    if (hotels.length === 0) {
      return NextResponse.json({
        hotels: [],
        total: results.length,
        city: resolved.displayName,
        memorySummary: null,
        resolved: { lat: resolved.lat, lng: resolved.lng, iata: resolved.iata ?? null },
        error: results.length > 0
          ? "Hotels were found but none had live rates for these dates."
          : `No hotels found near ${resolved.displayName}. Try different dates or a nearby airport code.`,
      });
    }

    const [genome, memory] = await Promise.all([getTravelerGenome(userId), getHotelStayMemory(userId)]);
    const loyaltyBalances = normalizeLoyaltyBalances(genome.loyaltyBalances ?? []);
    const ranked = rankHotelSearchResults({ hotels, genome, memory, loyaltyBalances });

    saveHotelStayMemory(
      learnFromHotelEvent(memory, {
        action: "searched",
        city: resolved.displayName,
      }),
      userId,
    ).catch(() => {});

    return NextResponse.json({
      hotels: ranked,
      total: results.length,
      city: resolved.displayName,
      memorySummary: summarizeHotelMemory(memory),
      resolved: { lat: resolved.lat, lng: resolved.lng, iata: resolved.iata ?? null },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
