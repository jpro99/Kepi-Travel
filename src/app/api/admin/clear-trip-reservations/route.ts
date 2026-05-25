import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { getActiveTrip, updateTrip } from "@/lib/travelAssistant/tripStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await resolveAuthenticatedUserId(request);
  if (!auth.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trip = await getActiveTrip(auth.userId);
  if (!trip) return NextResponse.json({ error: "No active trip" });
  return NextResponse.json({
    tripId: trip.id,
    tripName: trip.name,
    reservationCount: trip.reservations.length,
    reservations: trip.reservations.map((r) => ({
      id: r.id,
      type: r.type,
      provider: r.provider,
      localTime: r.localTime,
      flightDate: (r as Record<string, unknown>).flightDate ?? null,
      flightNumber: (r as Record<string, unknown>).flightNumber ?? null,
      location: r.location,
    })),
  });
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const auth = await resolveAuthenticatedUserId(request);
  if (!auth.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trip = await getActiveTrip(auth.userId);
  if (!trip) return NextResponse.json({ error: "No active trip" });
  const before = trip.reservations.length;
  await updateTrip(trip.id, { reservations: [], reviewQueue: [] }, auth.userId);
  return NextResponse.json({ cleared: before, tripId: trip.id });
}
