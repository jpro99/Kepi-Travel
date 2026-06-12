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

  const hotels = trip.reservations
    .filter((r) => r.type === "hotel")
    .map((h) => ({
      provider: h.provider,
      localTime: h.localTime,
      checkOutDate: h.checkOutDate,
      notes: typeof h.notes === "string" ? h.notes.slice(0, 200) : h.notes,
      allKeys: Object.keys(h),
    }));

  const flights = trip.reservations
    .filter((r) => r.type === "flight")
    .map((f) => ({
      provider: f.provider,
      flightNumber: f.flightNumber,
      localTime: f.localTime,
      timezone: f.timezone,
      flightDate: f.flightDate,
      flightDepartureAirport: f.flightDepartureAirport,
      flightArrivalAirport: f.flightArrivalAirport,
      flightDepartureTime: f.flightDepartureTime,
      flightArrivalTime: f.flightArrivalTime,
      confirmationCode: f.confirmationCode,
      allKeys: Object.keys(f),
    }));

  return NextResponse.json({ hotels, flights });
}
