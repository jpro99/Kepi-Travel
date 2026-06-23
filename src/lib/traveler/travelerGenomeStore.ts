import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";
import type { GenomeCorrection, TravelerGenome } from "@/lib/traveler/types";

const GENOME_KEY = "traveler-genome";

export async function getTravelerGenome(userId?: string): Promise<TravelerGenome> {
  try {
    // 3s timeout — if Redis hangs, fall back to sample genome immediately
    const existing = await Promise.race([
      kvStoreGet<TravelerGenome>(GENOME_KEY, { userId }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    if (existing) return existing;
  } catch {
    // Redis unavailable — use sample genome
  }

  const namespace = userId?.trim() || "anonymous";
  const seeded = createSampleGenome(namespace);
  // Best-effort save — don't block on this
  kvStoreSet(GENOME_KEY, seeded, { userId }).catch(() => {});
  return seeded;
}

export async function saveTravelerGenome(
  genome: TravelerGenome,
  userId?: string,
): Promise<TravelerGenome> {
  const updated: TravelerGenome = {
    ...genome,
    updatedAt: new Date().toISOString(),
  };
  await kvStoreSet(GENOME_KEY, updated, { userId });
  return updated;
}

export async function applyGenomeCorrection(
  correction: Omit<GenomeCorrection, "id" | "createdAt">,
  userId?: string,
): Promise<TravelerGenome> {
  const genome = await getTravelerGenome(userId);
  const entry: GenomeCorrection = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    ...correction,
  };

  const next = { ...genome, corrections: [...genome.corrections, entry] };

  if (correction.override === "never_redeye") {
    next.toleratesRedeye = false;
  }
  if (correction.override === "never_reposition_from") {
    const match = correction.context.match(/\b[A-Z]{3}\b/);
    if (match) {
      next.geoCluster = next.geoCluster.filter((a) => a.iata !== match[0]);
    }
  }
  if (correction.override === "prefer_hyatt_first") {
    next.hotelChainPriority = ["Hyatt", ...next.hotelChainPriority.filter((c) => c !== "Hyatt")];
  }
  if (correction.override === "prefer_nonstop") {
    next.prefersNonstop = true;
  }
  if (correction.override === "willing_to_reposition") {
    next.toleratesRepositioning = true;
  }
  if (correction.override === "not_willing_to_reposition") {
    next.toleratesRepositioning = false;
  }

  return saveTravelerGenome(next, userId);
}

export async function incrementTripCount(userId?: string): Promise<TravelerGenome> {
  const genome = await getTravelerGenome(userId);
  return saveTravelerGenome({ ...genome, tripCount: genome.tripCount + 1 }, userId);
}
