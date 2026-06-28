import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { rankHotelSearchResults } from "@/lib/hotels/intelligentRanking";
import { partitionHotelsBySearchCity } from "@/lib/hotels/hotelCityScope";
import { buildGoogleHotelsUrl } from "@/lib/decision/bookingLinks";
import { resolveHotelDestination, suggestHotelDestinations } from "@/lib/hotels/resolveDestination";
import { searchHotelsLiveOrEstimated } from "@/lib/hotels/searchHotels";
import { isLiteApiConfigured } from "@/lib/providers/liteapi/searchHotels";
import type { HotelSearchResult, RankedHotelSearchResult } from "@/lib/hotels/types";
import { getHotelStayMemory, learnFromHotelEvent, saveHotelStayMemory, buildHotelPreferenceInsight } from "@/lib/memory/hotelMemory";
import { getHotelStayProfile } from "@/lib/memory/hotelStayProfile";
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

  if (!process.env.DUFFEL_ACCESS_TOKEN?.trim() && !isLiteApiConfigured()) {
    return NextResponse.json(
      { error: "Hotels not configured — add DUFFEL_ACCESS_TOKEN and/or LITEAPI_KEY in Vercel." },
      { status: 500 },
    );
  }

  const resolved = await resolveHotelDestination(String(destination));
  if (!resolved) {
    return NextResponse.json(
      {
        error: `Could not find "${destination}". Try a city name (e.g. Monopoli, Italy) or airport code (e.g. BRI, FCO).`,
        suggestions: suggestHotelDestinations(String(destination)),
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
    const stayProfile = await getHotelStayProfile(userId);
    const loyaltyBalances = normalizeLoyaltyBalances(genome.loyaltyBalances ?? []);
    const ranked = rankHotelSearchResults({
      hotels: searchResult.hotels,
      genome,
      memory,
      loyaltyBalances,
      stayProfile,
      searchCity: resolved.displayName,
      searchCenter: { lat: resolved.lat, lng: resolved.lng },
    });

    const { inCity, nearby } = partitionHotelsBySearchCity(ranked, resolved.displayName, {
      lat: resolved.lat,
      lng: resolved.lng,
    });

    saveHotelStayMemory(
      learnFromHotelEvent(memory, {
        action: "searched",
        city: resolved.displayName,
      }),
      userId,
    ).catch(() => {});

    const liveInCity = inCity.filter((hotel) => !hotel.browseOnly && hotel.pricePerNight > 0).length;
    const browseInCity = inCity.filter((hotel) => hotel.browseOnly).length;
    const cityLabel = resolved.displayName.split(",")[0]?.trim() ?? resolved.displayName;

    const inventoryNote =
      liveInCity <= 3 && browseInCity > 0
        ? `${liveInCity} live rate${liveInCity === 1 ? "" : "s"} and ${browseInCity} more propert${browseInCity === 1 ? "y" : "ies"} to browse in ${cityLabel} for these dates. Hotels marked "Google" need pricing on Google Hotels — Kepi lists them so you can pick your own.`
        : liveInCity <= 3 && nearby.length > 0
          ? `Only ${liveInCity} live rate${liveInCity === 1 ? "" : "s"} in ${cityLabel} for these dates. ${nearby.length} more nearby — toggle "+ Nearby" or browse all on Google Hotels.`
          : liveInCity <= 3
            ? `Only ${liveInCity} live rate${liveInCity === 1 ? "" : "s"} in ${cityLabel} for these dates. More hotels exist — use Google Hotels for the full list or browse catalog results below.`
            : browseInCity > 0
              ? `${liveInCity} with live Kepi rates · ${browseInCity} more to browse (check price on Google).`
              : null;

    return NextResponse.json({
      hotels: ranked,
      total: ranked.length,
      inCityCount: inCity.length,
      nearbyCount: nearby.length,
      city: resolved.displayName,
      correctedFrom: resolved.correctedFrom ?? null,
      googleHotelsUrl: buildGoogleHotelsUrl({
        propertyName: "hotels",
        destination: resolved.displayName,
        checkInDate: checkIn,
        checkOutDate: checkOut,
      }),
      inventoryNote,
      preferenceInsight: buildHotelPreferenceInsight(
        memory,
        genome.hotelChainPriority ?? [],
        ranked,
        resolved.displayName,
      ),
      resolved: { lat: resolved.lat, lng: resolved.lng, iata: resolved.iata ?? null },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
