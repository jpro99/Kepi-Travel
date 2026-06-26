import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rankHotelSearchResults } from "@/lib/hotels/intelligentRanking";
import { resolveHotelDestination } from "@/lib/hotels/resolveDestination";
import { searchHotelsLiveOrEstimated } from "@/lib/hotels/searchHotels";
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

  if (!process.env.DUFFEL_ACCESS_TOKEN?.trim()) {
    return NextResponse.json({ error: "Hotels not configured — add DUFFEL_ACCESS_TOKEN in Vercel." }, { status: 500 });
  }

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

  try {
    const genome = await getTravelerGenome(userId);
    const searchResult = await searchHotelsLiveOrEstimated({
      resolved,
      checkIn,
      checkOut,
      nights,
      guests: Number(guests),
      rooms: Number(rooms),
      chainPriority: genome.hotelChainPriority,
    });

    if (searchResult.hotels.length === 0) {
      return NextResponse.json({
        hotels: [],
        total: 0,
        city: resolved.displayName,
        source: searchResult.source,
        notice: searchResult.notice,
        memorySummary: null,
        error:
          searchResult.duffelError ??
          `No hotels found near ${resolved.displayName}. Try different dates or a nearby airport code.`,
        resolved: { lat: resolved.lat, lng: resolved.lng, iata: resolved.iata ?? null },
      });
    }

    const memory = await getHotelStayMemory(userId);
    const loyaltyBalances = normalizeLoyaltyBalances(genome.loyaltyBalances ?? []);
    const ranked = rankHotelSearchResults({
      hotels: searchResult.hotels,
      genome,
      memory,
      loyaltyBalances,
    });

    saveHotelStayMemory(
      learnFromHotelEvent(memory, {
        action: "searched",
        city: resolved.displayName,
      }),
      userId,
    ).catch(() => {});

    return NextResponse.json({
      hotels: ranked,
      total: ranked.length,
      city: resolved.displayName,
      source: searchResult.source,
      notice: searchResult.notice,
      memorySummary: summarizeHotelMemory(memory),
      resolved: { lat: resolved.lat, lng: resolved.lng, iata: resolved.iata ?? null },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
