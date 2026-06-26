import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { normalizeLoyaltyBalances } from "@/lib/loyalty/walletBalances";
import { getKvIntegrationHealth } from "@/lib/travelAssistant/kvStore";
import { getTravelerGenome, saveTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PostBodySchema = z.object({
  balances: z.unknown(),
});

function storageMeta() {
  const health = getKvIntegrationHealth();
  return {
    mode: health.mode,
    persistent: health.mode === "upstash-redis",
    ...(health.missingEnvKeys.length > 0 ? { missingEnvKeys: health.missingEnvKeys } : {}),
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const genome = await getTravelerGenome(userId);
  const balances = normalizeLoyaltyBalances(genome.loyaltyBalances ?? []);
  return NextResponse.json({ balances, storage: storageMeta() });
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

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const balances = normalizeLoyaltyBalances(parsed.data.balances);
  const genome = await getTravelerGenome(userId);

  try {
    const saved = await saveTravelerGenome({ ...genome, loyaltyBalances: balances }, userId);
    return NextResponse.json({
      ok: true,
      balances: normalizeLoyaltyBalances(saved.loyaltyBalances ?? balances),
      storage: storageMeta(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to save loyalty wallet",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
