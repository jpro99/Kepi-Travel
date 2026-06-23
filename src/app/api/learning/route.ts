import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTravelerGenome, saveTravelerGenome } from "@/lib/traveler/travelerGenomeStore";
import { extractInsights, type TripRating } from "@/lib/learning/tripInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const genome = await getTravelerGenome(userId);
  const ratings = (genome.tripRatings ?? []) as TripRating[];
  return NextResponse.json({ ratings, insights: extractInsights(ratings) });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rating = await req.json() as TripRating;
  const genome = await getTravelerGenome(userId);
  const existing = (genome.tripRatings ?? []) as TripRating[];
  const next = [...existing.filter(r => r.tripId !== rating.tripId), { ...rating, completedAt: new Date().toISOString() }];
  await saveTravelerGenome({ ...genome, tripRatings: next }, userId);
  return NextResponse.json({ ok: true, totalRatings: next.length });
}
