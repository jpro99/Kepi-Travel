import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { userHasMemberHotelPricing } from "@/lib/billing/memberHotelPricing";
import { guestTotalForPlan } from "@/lib/hotels/guestPricing";
import { prebookLiteApiOffer } from "@/lib/providers/liteapi/bookHotel";
import { isLiteApiConfigured } from "@/lib/providers/liteapi/searchHotels";
import { isHotelSoldOutError, normalizeHotelAvailabilityError } from "@/lib/hotels/hotelAvailabilityError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isLiteApiConfigured()) {
    return NextResponse.json({ error: "In-app hotel booking is not configured yet." }, { status: 503 });
  }

  const body = (await req.json()) as { offerId?: string; searchTotalUsd?: number };
  const offerId = body.offerId?.trim();
  if (!offerId) {
    return NextResponse.json({ error: "Missing offerId." }, { status: 400 });
  }

  const searchTotalUsd =
    typeof body.searchTotalUsd === "number" && Number.isFinite(body.searchTotalUsd)
      ? body.searchTotalUsd
      : null;

  try {
    const isMember = await userHasMemberHotelPricing(userId);
    const prebook = await prebookLiteApiOffer(offerId);
    const guestTotalUsd = guestTotalForPlan(prebook.netTotalUsd, isMember);
    const deltaUsd =
      searchTotalUsd !== null ? Math.round((guestTotalUsd - searchTotalUsd) * 100) / 100 : null;
    const priceChanged = deltaUsd !== null && Math.abs(deltaUsd) >= 1;

    return NextResponse.json({
      guestTotalUsd,
      netTotalUsd: prebook.netTotalUsd,
      isMemberRate: isMember,
      roomName: prebook.roomName ?? null,
      currency: prebook.currency,
      searchTotalUsd,
      deltaUsd,
      priceChanged,
      cancellation: prebook.cancellation ?? null,
      referenceTotalUsd: prebook.referenceTotalUsd ?? null,
      referencePriceSource: prebook.referencePriceSource ?? null,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Could not verify price";
    const message = normalizeHotelAvailabilityError(raw);
    return NextResponse.json(
      { error: message, soldOut: isHotelSoldOutError(raw) },
      { status: 502 },
    );
  }
}
