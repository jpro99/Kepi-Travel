import { formatStopRoute } from "@/lib/decision/stopDates";
import type { TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";
import { generateTopologyCandidates } from "@/lib/decision/topology/generate";
import { priceTopologyLeg, summarizePricedTopology } from "@/lib/decision/topology/priceLeg";
import type {
  PricedTopology,
  PricedTopologyLeg,
  TopologySearchResult,
  TripTopologyCandidate,
} from "@/lib/decision/topology/types";

const MAX_DUFFEL_CALLS = 36;
const MAX_WINNERS = 5;
const PRUNE_MARGIN = 1.04;

export interface WaveSearchOptions {
  maxDuffelCalls?: number;
  maxWinners?: number;
}

function buildRouteSummary(intent: TripIntent): string {
  const stops = intent.stops ?? [];
  if (stops.length === 0) {
    return `${intent.originAirports?.[0] ?? "Home"} → ${intent.destination} → ${intent.originAirports?.[0] ?? "Home"}`;
  }
  const origin = intent.originAirports?.[0] ?? "Home";
  return `${origin} → ${formatStopRoute(stops)} → ${intent.returnAirports?.[0] ?? stops[stops.length - 1]?.iata ?? "Home"}`;
}

async function priceCandidate(
  candidate: TripTopologyCandidate,
  duffelBudget: { remaining: number },
): Promise<PricedTopology | null> {
  const legs: PricedTopologyLeg[] = [];

  for (const leg of candidate.flightLegs) {
    if (leg.pricing === "cash_live") {
      if (duffelBudget.remaining <= 0) {
        legs.push({ leg, priced: false });
        continue;
      }
      duffelBudget.remaining -= 1;
    }
    const priced = await priceTopologyLeg(leg);
    legs.push(priced);
  }

  const summary = summarizePricedTopology(candidate, legs);
  if (summary.liveLegCount === 0 && candidate.kind !== "naive_roundtrip") {
    return null;
  }

  return {
    candidate,
    legs,
    groundLegs: candidate.groundLegs,
    totalCashUsd: summary.totalCashUsd,
    totalAwardMiles: summary.totalAwardMiles,
    imputedPointsUsd: summary.imputedPointsUsd,
    totalTripValue: summary.totalTripValue,
    frictionMinutes: candidate.frictionMinutes,
    confidence: summary.confidence,
    liveLegCount: summary.liveLegCount,
    totalFlightLegs: candidate.flightLegs.length,
    savingsVsBaselineUsd: 0,
    savingsVsBaselinePct: 0,
  };
}

function applyBaselineSavings(baseline: PricedTopology | null, priced: PricedTopology[]): PricedTopology[] {
  if (!baseline) return priced;
  const baseValue = baseline.totalTripValue;
  return priced.map((row) => {
    const savings = baseValue - row.totalTripValue;
    const pct = baseValue > 0 ? Math.round((savings / baseValue) * 100) : 0;
    return {
      ...row,
      savingsVsBaselineUsd: Math.round(savings),
      savingsVsBaselinePct: pct,
    };
  });
}

function rankWinners(rows: PricedTopology[]): PricedTopology[] {
  return [...rows].sort((a, b) => {
    if (a.totalTripValue !== b.totalTripValue) return a.totalTripValue - b.totalTripValue;
    if (a.liveLegCount !== b.liveLegCount) return b.liveLegCount - a.liveLegCount;
    return a.frictionMinutes - b.frictionMinutes;
  });
}

/**
 * Kepi Wave Search — generates trip topologies, prices in waves, prunes dominated shapes,
 * and returns winners with savings vs naive round-trip baseline.
 */
export async function runKepiWaveSearch(
  intent: TripIntent,
  genome: TravelerGenome,
  searchAirports: string[],
  options: WaveSearchOptions = {},
): Promise<TopologySearchResult> {
  const maxDuffelCalls = options.maxDuffelCalls ?? MAX_DUFFEL_CALLS;
  const maxWinners = options.maxWinners ?? MAX_WINNERS;
  const routeSummary = buildRouteSummary(intent);

  const candidates = generateTopologyCandidates(intent, genome, searchAirports);
  if (candidates.length === 0) {
    return {
      algorithm: "kepi-wave-search",
      version: 1,
      candidatesGenerated: 0,
      candidatesPriced: 0,
      candidatesPruned: 0,
      duffelCallsUsed: 0,
      baseline: null,
      winners: [],
      bestSavingsUsd: 0,
      bestSavingsPct: 0,
      routeSummary,
      headline: "Add your departure city to run Kepi Wave Search.",
    };
  }

  const duffelBudget = { remaining: maxDuffelCalls };
  let pruned = 0;
  let baselineValue = Number.POSITIVE_INFINITY;

  const wave0 = candidates.filter((c) => c.wave === 0);
  const rest = candidates.filter((c) => c.wave > 0);

  const pricedRows: PricedTopology[] = [];

  for (const candidate of wave0) {
    const row = await priceCandidate(candidate, duffelBudget);
    if (row) {
      pricedRows.push(row);
      baselineValue = Math.min(baselineValue, row.totalTripValue);
    }
  }

  const baseline =
    pricedRows.find((r) => r.candidate.kind === "naive_roundtrip") ??
    pricedRows.sort((a, b) => a.totalTripValue - b.totalTripValue)[0] ??
    null;

  if (baseline) {
    baselineValue = baseline.totalTripValue;
  }

  for (const candidate of rest) {
    if (baselineValue < Number.POSITIVE_INFINITY && candidate.estimateLowerBoundUsd * PRUNE_MARGIN > baselineValue) {
      pruned += 1;
      continue;
    }
    const row = await priceCandidate(candidate, duffelBudget);
    if (!row) continue;
    pricedRows.push(row);
  }

  const withSavings = applyBaselineSavings(baseline, pricedRows);
  const winners = rankWinners(withSavings.filter((r) => r.candidate.kind !== "naive_roundtrip")).slice(0, maxWinners);

  const best = winners[0];
  const bestSavingsUsd = best?.savingsVsBaselineUsd ?? 0;
  const bestSavingsPct = best?.savingsVsBaselinePct ?? 0;

  let headline = "Kepi searched trip shapes — no live fares returned.";
  if (best && bestSavingsUsd > 0) {
    headline = `Kepi Wave Search found ${best.candidate.title} — saves ~$${bestSavingsUsd.toLocaleString()} vs simple round-trip`;
  } else if (best) {
    headline = `Best routing: ${best.candidate.title} — simple round-trip is already competitive`;
  } else if (baseline) {
    headline = `Baseline round-trip ~$${baseline.totalCashUsd.toLocaleString()} — try flex dates for more savings`;
  }

  return {
    algorithm: "kepi-wave-search",
    version: 1,
    candidatesGenerated: candidates.length,
    candidatesPriced: pricedRows.length,
    candidatesPruned: pruned,
    duffelCallsUsed: maxDuffelCalls - duffelBudget.remaining,
    baseline,
    winners,
    bestSavingsUsd,
    bestSavingsPct,
    routeSummary,
    headline,
  };
}
