import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";
import { getProgramById } from "@/lib/loyalty/programs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ExpirationAlert {
  programId: string;
  programName: string;
  miles: number;
  expiresAt: string;
  daysLeft: number;
  cashValue: number;
  urgency: "critical" | "warning" | "watch";
  action: string;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ alerts: [] });

  const genome = await getTravelerGenome(userId);
  const balances = (genome.loyaltyBalances ?? []) as {
    programId: string; miles: number; tier?: string; expiresAt?: string;
  }[];

  const now = Date.now();
  const alerts: ExpirationAlert[] = [];

  for (const bal of balances) {
    if (!bal.expiresAt || bal.miles < 100) continue;
    const prog = getProgramById(bal.programId);
    if (!prog) continue;

    const expiresMs = new Date(bal.expiresAt).getTime();
    const daysLeft = Math.ceil((expiresMs - now) / 86_400_000);

    if (daysLeft > 180) continue; // Only alert within 6 months

    const cashValue = Math.round(bal.miles * prog.cppEstimate / 100);
    const urgency: ExpirationAlert["urgency"] = daysLeft <= 30 ? "critical" : daysLeft <= 60 ? "warning" : "watch";

    const action = daysLeft <= 30
      ? `Use or transfer ${bal.miles.toLocaleString()} miles NOW — expires in ${daysLeft} days`
      : daysLeft <= 60
      ? `Book a trip or transfer to keep your ${bal.miles.toLocaleString()} miles`
      : `Plan ahead — your ${prog.shortName} miles expire in ${daysLeft} days`;

    alerts.push({
      programId: bal.programId,
      programName: prog.shortName,
      miles: bal.miles,
      expiresAt: bal.expiresAt,
      daysLeft,
      cashValue,
      urgency,
      action,
    });
  }

  return NextResponse.json({
    alerts: alerts.sort((a, b) => a.daysLeft - b.daysLeft),
  });
}
