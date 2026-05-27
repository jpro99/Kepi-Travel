import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActiveTrip } from "@/lib/travelAssistant/tripStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trip = await getActiveTrip(userId);
  if (!trip) return NextResponse.json({ error: "No active trip" }, { status: 404 });

  const hotels = trip.reservations.filter((r: Record<string, unknown>) => r.type === "hotel");
  const debug = hotels.map((h: Record<string, unknown>) => ({
    id: h.id,
    provider: h.provider,
    localTime: h.localTime,
    checkOutDate: h.checkOutDate,
    checkout_date: h.checkout_date,
    checkoutDate: h.checkoutDate,
    endDate: h.endDate,
    notes: typeof h.notes === "string" ? h.notes.slice(0, 200) : h.notes,
    allKeys: Object.keys(h),
  }));

  return NextResponse.json({ hotels: debug });
}
