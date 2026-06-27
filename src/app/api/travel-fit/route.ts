import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { getPointsTravelProfile } from "@/lib/memory/pointsTravelProfile";
import { getTravelHabitsSnapshot } from "@/lib/memory/travelHabitsStore";
import { getHotelStayMemory } from "@/lib/memory/hotelMemory";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";
import { buildTravelFitReport } from "@/lib/travelFit/buildTravelFitReport";
import type { TravelFitReservation } from "@/lib/travelFit/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ReservationSchema = z.object({
  id: z.string(),
  type: z.string(),
  provider: z.string().optional(),
  title: z.string().optional(),
  location: z.string().optional(),
  localTime: z.string().optional(),
  checkOutDate: z.string().optional(),
  flightDepartureAirport: z.string().optional(),
  flightArrivalAirport: z.string().optional(),
  flightDate: z.string().optional(),
});

const BodySchema = z.object({
  reservations: z.array(ReservationSchema).optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [genome, pointsProfile, storedHabits, hotelMemory] = await Promise.all([
    getTravelerGenome(userId),
    getPointsTravelProfile(userId),
    getTravelHabitsSnapshot(userId),
    getHotelStayMemory(userId),
  ]);

  const mergedProfile = pointsProfile.typicalHotelNightlyUsd
    ? pointsProfile
    : {
        ...pointsProfile,
        typicalHotelNightlyUsd: hotelMemory.typicalNightlyUsd ?? pointsProfile.typicalHotelNightlyUsd,
      };

  const report = buildTravelFitReport({
    userId,
    reservations: [],
    genome,
    pointsProfile: mergedProfile,
    storedHabits,
  });

  return NextResponse.json({ report, genome: { homeRegion: genome.homeRegion, geoCluster: genome.geoCluster } });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [genome, pointsProfile, storedHabits, hotelMemory] = await Promise.all([
    getTravelerGenome(userId),
    getPointsTravelProfile(userId),
    getTravelHabitsSnapshot(userId),
    getHotelStayMemory(userId),
  ]);

  const mergedProfile = pointsProfile.typicalHotelNightlyUsd
    ? pointsProfile
    : {
        ...pointsProfile,
        typicalHotelNightlyUsd: hotelMemory.typicalNightlyUsd ?? pointsProfile.typicalHotelNightlyUsd,
      };

  const reservations = (parsed.data.reservations ?? []) as TravelFitReservation[];
  const report = buildTravelFitReport({
    userId,
    reservations,
    genome,
    pointsProfile: mergedProfile,
    storedHabits,
  });

  return NextResponse.json({ report });
}
