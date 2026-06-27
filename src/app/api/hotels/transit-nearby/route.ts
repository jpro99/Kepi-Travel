import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { fetchBusStopsNear, fetchMetroStopsNear } from "@/lib/hotels/nearbyTransit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  kind: z.enum(["metro", "bus", "all"]).default("metro"),
});

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng"),
    kind: url.searchParams.get("kind") ?? "metro",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lat, lng, or kind" }, { status: 400 });
  }

  const { lat, lng, kind } = parsed.data;

  try {
    const metro = kind === "bus" ? [] : await fetchMetroStopsNear(lat, lng);
    const buses = kind === "metro" ? [] : await fetchBusStopsNear(lat, lng);
    const stops = kind === "all" ? [...metro, ...buses] : kind === "bus" ? buses : metro;

    return NextResponse.json({
      stops,
      metroCount: metro.length,
      busCount: buses.length,
      source: "openstreetmap",
    });
  } catch {
    return NextResponse.json({ stops: [], metroCount: 0, busCount: 0, source: "openstreetmap" });
  }
}
