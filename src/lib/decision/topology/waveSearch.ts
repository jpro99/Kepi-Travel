import { formatStopRoute } from "@/lib/decision/stopDates";
import type { TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";
import { JOINT_DATE_SHIFTS, shiftCandidateDates } from "@/lib/decision/topology/dateShift";
import { generateTopologyCandidates } from "@/lib/decision/topology/generate";
import { estimateTripHotels } from "@/lib/decision/topology/hotelEstimate";
import {
  DuffelCallBudget,
  priceTopologyCandidateParallel,
  rankScoreForCheapest,
  summarizePricedTopology,
} from "@/lib/decision/topology/priceLeg";
import type {
  PricedTopology,
  TopologySearchResult,
  TripTopologyCandidate,
} from "@/lib/decision/topology/types";

const MAX_DUFFEL_CALLS = 54;
const MAX_WINNERS = 5;
const DATE_FLEX_TOP_N = 6;
const PRUNE_MARGIN = 1.03;

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

function isBaselineKind(kind: TripTopologyCandidate["kind"]): boolean {
  return kind === "naive_roundtrip" || kind === "primary_hub_roundtrip";
}

async function priceCandidate(
  candidate: TripTopologyCandidate,
  budget: DuffelCallBudget,
  hotelCashUsd: number,
): Promise<PricedTopology | null> {
  const legs = await priceTopologyCandidateParallel(candidate, budget);
  const summary = summarizePricedTopology(candidate, legs, hotelCashUsd);

  if (summary.liveLegCount === 0 && !isBaselineKind(candidate.kind)) {
    return null;
  }

  return {
    candidate,
    legs,
    groundLegs: candidate.groundLegs,
    totalCashUsd: summary.totalCashUsd,
    hotelCashUsd: summary.hotelCashUsd,
    grandTotalCashUsd: summary.grandTotalCashUsd,
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
  const baseScore = rankScoreForCheapest(baseline);
  return priced.map((row) => {
    const score = rankScoreForCheapest(row);
    const savings = baseScore - score;
    const pct = baseScore > 0 ? Math.round((savings / baseScore) * 100) : 0;
    return {
      ...row,
      savingsVsBaselineUsd: Math.round(savings),
      savingsVsBaselinePct: pct,
    };
  });
}

function rankWinners(rows: PricedTopology[]): PricedTopology[] {
  return [...rows].sort((a, b) => {
    const scoreA = rankScoreForCheapest(a);
    const scoreB = rankScoreForCheapest(b);
    if (scoreA !== scoreB) return scoreA - scoreB;
    if (a.liveLegCount !== b.liveLegCount) return b.liveLegCount - a.liveLegCount;
    return a.frictionMinutes - b.frictionMinutes;
  });
}

function pickBaseline(pricedRows: PricedTopology[]): PricedTopology | null {
  const baselines = pricedRows.filter((r) => isBaselineKind(r.candidate.kind));
  if (baselines.length === 0) {
    return pricedRows.sort((a, b) => rankScoreForCheapest(a) - rankScoreForCheapest(b))[0] ?? null;
  }
  return baselines.sort((a, b) => rankScoreForCheapest(a) - rankScoreForCheapest(b))[0] ?? null;
}

/**
 * Kepi Optimal Trip Search — expanded topologies, hotels in grand total,
 * parallel leg pricing, joint date flex on top shapes, cheapest-first ranking.
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
  const hotels = estimateTripHotels(intent, genome);
  const hotelCashUsd = hotels.totalCashUsd;

  const candidates = generateTopologyCandidates(intent, genome, searchAirports);
  if (candidates.length === 0) {
    return {
      algorithm: "kepi-optimal-search",
      version: 2,
      candidatesGenerated: 0,
      candidatesPriced: 0,
      candidatesPruned: 0,
      dateFlexVariantsPriced: 0,
      duffelCallsUsed: 0,
      hotelEstimateUsd: hotelCashUsd,
      baseline: null,
      winners: [],
      bestSavingsUsd: 0,
      bestSavingsPct: 0,
      routeSummary,
      headline: "Add your departure city to run Kepi Optimal Search.",
    };
  }

  const budget = new DuffelCallBudget(maxDuffelCalls);
  let pruned = 0;
  let dateFlexPriced = 0;

  const wave0 = candidates.filter((c) => c.wave === 0);
  const rest = candidates.filter((c) => c.wave > 0);

  const pricedRows: PricedTopology[] = [];

  for (const candidate of wave0) {
    const row = await priceCandidate(candidate, budget, hotelCashUsd);
    if (row) pricedRows.push(row);
  }

  const baseline = pickBaseline(pricedRows);
  const baselineScore = baseline ? rankScoreForCheapest(baseline) : Number.POSITIVE_INFINITY;

  for (const candidate of rest) {
    if (
      baselineScore < Number.POSITIVE_INFINITY &&
      candidate.estimateLowerBoundUsd * PRUNE_MARGIN + hotelCashUsd > baselineScore
    ) {
      pruned += 1;
      continue;
    }
    const row = await priceCandidate(candidate, budget, hotelCashUsd);
    if (row) pricedRows.push(row);
  }

  const rankedInitial = rankWinners(pricedRows.filter((r) => !isBaselineKind(r.candidate.kind)));
  const flexSeeds = rankedInitial.slice(0, DATE_FLEX_TOP_N);

  for (const seed of flexSeeds) {
    if (budget.remaining <= 0) break;
    for (const shift of JOINT_DATE_SHIFTS) {
      if (budget.remaining <= 0) break;
      const shifted: TripTopologyCandidate = {
        ...shiftCandidateDates(seed.candidate, shift),
        kind: "date_flex",
      };
      const row = await priceCandidate(shifted, budget, hotelCashUsd);
      if (row) {
        pricedRows.push(row);
        dateFlexPriced += 1;
      }
    }
  }

  const withSavings = applyBaselineSavings(baseline, pricedRows);
  const winners = rankWinners(withSavings.filter((r) => !isBaselineKind(r.candidate.kind))).slice(0, maxWinners);

  const best = winners[0];
  const bestSavingsUsd = best?.savingsVsBaselineUsd ?? 0;
  const bestSavingsPct = best?.savingsVsBaselinePct ?? 0;

  let headline = "Kepi searched trip shapes — no live fares returned.";
  if (best && bestSavingsUsd > 0) {
    const flexNote = best.candidate.dateShiftDays ? ` · ${best.candidate.title.includes("flex") ? "date-flex win" : ""}` : "";
    headline = `Kepi Optimal Search found ${best.candidate.title} — saves ~$${bestSavingsUsd.toLocaleString()} all-in (flights + hotels)${flexNote}`;
  } else if (best) {
    headline = `Best routing: ${best.candidate.title} — ~$${best.grandTotalCashUsd.toLocaleString()} all-in · baseline is competitive`;
  } else if (baseline) {
    headline = `Baseline ~$${baseline.grandTotalCashUsd.toLocaleString()} all-in — includes ~$${hotelCashUsd.toLocaleString()} hotels`;
  }

  return {
    algorithm: "kepi-optimal-search",
    version: 2,
    candidatesGenerated: candidates.length,
    candidatesPriced: pricedRows.length,
    candidatesPruned: pruned,
    dateFlexVariantsPriced: dateFlexPriced,
    duffelCallsUsed: budget.used,
    hotelEstimateUsd: hotelCashUsd,
    baseline,
    winners,
    bestSavingsUsd,
    bestSavingsPct,
    routeSummary,
    headline,
  };
}
