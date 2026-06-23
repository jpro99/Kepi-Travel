import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTravelerGenome, saveTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const genome = await getTravelerGenome(userId);
  return NextResponse.json({ balances: genome.loyaltyBalances ?? [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { balances } = await req.json();
  const genome = await getTravelerGenome(userId);
  await saveTravelerGenome({ ...genome, loyaltyBalances: balances }, userId);
  return NextResponse.json({ ok: true });
}
