import type { TravelStrategy } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";

export interface StrategyValueMetrics {
  cashOutOfPocket: number;
  pointsImputedUsd: number;
  totalTripValue: number;
  bestCpp: number;
  sortKey: number;
}

export function computeStrategyValueMetrics(
  strategy: TravelStrategy,
  repositionPenaltyUsd = 0,
): StrategyValueMetrics {
  const cashOutOfPocket = Math.round(strategy.segments.reduce((sum, s) => sum + s.costUsd, 0));
  const pointsImputedUsd = Math.round(
    strategy.segments
      .filter((s) => s.milesUsed && s.milesUsed > 0)
      .reduce((sum, s) => sum + ((s.milesUsed ?? 0) * (s.cpp ?? 1.5)) / 100, 0),
  );
  const totalTripValue = cashOutOfPocket + pointsImputedUsd;
  const flightCpp = strategy.segments
    .filter((s) => s.mode === "flight" && s.cpp)
    .map((s) => s.cpp ?? 0);
  const bestCpp = flightCpp.length > 0 ? Math.max(...flightCpp) : 0;
  const sortKey = totalTripValue + repositionPenaltyUsd;

  return {
    cashOutOfPocket,
    pointsImputedUsd,
    totalTripValue,
    bestCpp,
    sortKey,
  };
}

function compareByValue(a: TravelStrategy, b: TravelStrategy): number {
  const aKey = a.scores.sortKey ?? a.scores.totalTripValue ?? a.scores.trueOutOfPocket;
  const bKey = b.scores.sortKey ?? b.scores.totalTripValue ?? b.scores.trueOutOfPocket;
  if (aKey !== bKey) return aKey - bKey;
  const aCpp = a.scores.bestCpp ?? 0;
  const bCpp = b.scores.bestCpp ?? 0;
  if (aCpp !== bCpp) return bCpp - aCpp;
  if (a.scores.trueOutOfPocket !== b.scores.trueOutOfPocket) {
    return a.scores.trueOutOfPocket - b.scores.trueOutOfPocket;
  }
  return a.scores.frictionMinutes - b.scores.frictionMinutes;
}

function tvsForRank(rank: number, comfortWeight: number, comfortScore: number): number {
  const base = Math.max(62, 97 - (rank - 1) * 9);
  const comfortNudge = Math.round((comfortScore - 75) * comfortWeight * 0.12);
  return Math.min(100, base + comfortNudge);
}

function buildStatusRecommendReason(
  statusPlay: TravelStrategy,
  best: TravelStrategy,
  genome: TravelerGenome,
): string {
  const costDelta = statusPlay.scores.trueOutOfPocket - best.scores.trueOutOfPocket;
  const programs = [...new Set(genome.statuses.map((s) => s.program))].slice(0, 2);
  const programLabel = programs.length > 0 ? programs.join(" · ") : "airline and hotel";
  return `Ranked #${statusPlay.valueRank} on pure cost (~$${Math.max(0, costDelta).toLocaleString()} more cash than ${best.title}), but earns ${programLabel} status credit, lounge access, and requal progress — recommended if status is on your roadmap this year.`;
}

/**
 * Ranks strategies #1–#N by total trip value (cash + points at segment ¢/pt),
 * tie-broken by best flight redemption. Sets Kepi's pick on #1; may flag Status Play
 * when the traveler weights status in their genome.
 */
export function rankStrategiesByValue(
  strategies: TravelStrategy[],
  genome: TravelerGenome,
  comfortWeight = 0.55,
): TravelStrategy[] {
  const enriched = strategies.map((s) => {
    const penalty =
      s.kind === "reposition_award" && !genome.toleratesRepositioning ? 4_000 : 0;
    const metrics = computeStrategyValueMetrics(s, penalty);
    return {
      ...s,
      recommended: false,
      statusRecommended: false,
      scores: {
        ...s.scores,
        trueOutOfPocket: metrics.cashOutOfPocket,
        totalTripValue: metrics.totalTripValue,
        bestCpp: metrics.bestCpp,
        sortKey: metrics.sortKey,
      },
    };
  });

  const sorted = [...enriched].sort(compareByValue);

  const statusWeight = genome.decisionWeights.status;
  const caresAboutStatus = statusWeight >= 0.08 || genome.statuses.length > 0;
  const best = sorted[0];

  return sorted.map((s, index) => {
    const rank = index + 1;
    const isTopValue = rank === 1;
    const statusRecommended =
      !isTopValue &&
      caresAboutStatus &&
      s.kind === "status_play" &&
      rank <= 4 &&
      best !== undefined;

    return {
      ...s,
      valueRank: rank,
      recommended: isTopValue,
      statusRecommended,
      statusRecommendReason:
        statusRecommended && best
          ? buildStatusRecommendReason({ ...s, valueRank: rank }, best, genome)
          : undefined,
      scores: {
        ...s.scores,
        tvs: tvsForRank(rank, comfortWeight, s.scores.comfortScore),
      },
    };
  });
}
