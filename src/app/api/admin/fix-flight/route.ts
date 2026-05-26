import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActiveTrip, updateTrip } from "@/lib/travelAssistant/tripStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Record<string, string>;
  const { reservationId, ...fields } = body;

  const trip = await getActiveTrip(userId);
  if (!trip) return NextResponse.json({ error: "No active trip" });

  const updatedReservations = trip.reservations.map((r) => {
    if (r.id !== reservationId) return r;
    return { ...(r as Record<string, unknown>), ...fields };
  });

  await updateTrip(trip.id, { reservations: updatedReservations }, userId);
  return NextResponse.json({ ok: true, reservationId, fields });
}
