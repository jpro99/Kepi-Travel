import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActiveTrip, updateTrip } from "@/lib/travelAssistant/tripStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const trip = await getActiveTrip(userId);
  if (!trip) return NextResponse.json({ error: "No active trip" }, { status: 404 });

  let patched = 0;
  const updatedReservations = trip.reservations.map((r) => {
    if (r.type !== "flight") return r;

    // AS832 HND→HNL — arrives 10:00 AM HST (Pacific/Honolulu)
    if (r.flightNumber === "AS832" && r.flightArrivalAirport === "HNL") {
      patched++;
      return {
        ...r,
        flightArrivalTime: "2026-05-29 10:00",
      };
    }

    // AS271 HNL→ONT — arrives 10:17 PM PDT (America/Los_Angeles)
    if (r.flightNumber === "AS271" && r.flightArrivalAirport === "ONT") {
      patched++;
      return {
        ...r,
        flightArrivalTime: "2026-05-29 22:17",
      };
    }

    return r;
  });

  await updateTrip(trip.id, { reservations: updatedReservations }, userId);

  return NextResponse.json({ ok: true, patched, message: `Updated ${patched} flight arrival times` });
}
