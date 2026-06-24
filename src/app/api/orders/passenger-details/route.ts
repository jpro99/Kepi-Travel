import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const genome = await getTravelerGenome(userId);
  return NextResponse.json({ details: genome.savedPassengerDetails ?? null });
}
