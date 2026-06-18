import type { TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";

const US_ORIGIN_REGIONS = new Set([
  "California",
  "Washington",
  "New York",
  "New Jersey",
  "Illinois",
  "Massachusetts",
  "Hawaii",
]);

/** Strip return-leg phrases that falsely match "west coast" as departure. */
export function stripOriginParseNoise(lower: string): string {
  return lower
    .replace(/\bfly(?:\s+back|\s+home)\b[^.]{0,140}?\bfrom\s+(?:the\s+)?west\s+coast\b/gi, "fly home")
    .replace(/\breturn(?:\s+on|\s+around)?[^.]{0,140}?\bfrom\s+(?:the\s+)?west\s+coast\b/gi, "return");
}

export function isInternationalTripIntent(intent: Pick<TripIntent, "region" | "originRegion">): boolean {
  if (intent.originRegion && !US_ORIGIN_REGIONS.has(intent.originRegion)) {
    return true;
  }
  return Boolean(intent.region && !US_ORIGIN_REGIONS.has(intent.region));
}

export function intentHasStatedOrigin(intent: TripIntent): boolean {
  return Boolean(intent.originAirports?.length);
}

export function originRequiredForIntent(intent: TripIntent): boolean {
  return !intentHasStatedOrigin(intent) && isInternationalTripIntent(intent);
}

export function resolveSearchAirports(intent: TripIntent, genome: TravelerGenome): string[] {
  if (intent.originAirports?.length) {
    return [...new Set(intent.originAirports.map((code) => code.toUpperCase()))].slice(0, 6);
  }
  if (isInternationalTripIntent(intent)) {
    return [];
  }
  return [...new Set(genome.geoCluster.map((airport) => airport.iata))].slice(0, 6);
}

export function resolvePrimaryOrigin(intent: TripIntent, genome: TravelerGenome): string | null {
  const fromIntent = intent.originAirports?.[0]?.toUpperCase();
  if (fromIntent) return fromIntent;
  if (isInternationalTripIntent(intent)) return null;
  return genome.geoCluster.find((airport) => airport.isPrimary)?.iata ?? genome.geoCluster[0]?.iata ?? null;
}
