import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";
import { createSampleGenome } from "@/lib/traveler/sampleGenome";
import type { GenomeCorrection, TravelerGenome } from "@/lib/traveler/types";

const GENOME_KEY = "traveler-genome";

export async function getTravelerGenome(userId?: string): Promise<TravelerGenome> {
  const existing = await kvStoreGet<TravelerGenome>(GENOME_KEY, { userId });
  if (existing) return existing;

  const namespace = userId?.trim() || "anonymous";
  const seeded = createSampleGenome(namespace);
  await kvStoreSet(GENOME_KEY, seeded, { userId });
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
