import { resolveCashBookUrl } from "@/lib/decision/bookingLinks";
import type { TravelStrategy, StrategySegment } from "@/lib/decision/types";
import type { PricedTopology, TopologySearchResult } from "@/lib/decision/topology/types";

function kindForTopology(row: PricedTopology): TravelStrategy["kind"] {
  if (row.candidate.kind === "position_award") return "reposition_award";
  return "direct_cash";
}

function segmentsFromTopology(row: PricedTopology): StrategySegment[] {
  const segments: StrategySegment[] = [];

  for (const priced of row.legs) {
    const leg = priced.leg;
    if (leg.role === "feeder") {
      segments.push({
        mode: "drive",
        label: `${leg.fromLabel} → ${leg.toLabel}`,
        detail: "Positioning feeder · live cash",
        costUsd: priced.amountUsd ?? 0,
      });
      continue;
    }
    if (leg.pricing === "award_estimate") {
      segments.push({
        mode: "flight",
        label: `${leg.fromIata} → ${leg.toIata}`,
        detail: `Partner award · ~${priced.awardMiles?.toLocaleString() ?? "?"} miles · verify on Seats.aero`,
        costUsd: priced.amountUsd ?? 5.6,
        milesUsed: priced.awardMiles,
        cpp: 2.0,
      });
      continue;
    }
    const book = priced.offerId
      ? resolveCashBookUrl({
          origin: leg.fromIata,
          destination: leg.toIata,
          departureDate: leg.departureDate,
          airline: priced.airline,
          offerId: priced.offerId,
          quotedPriceUsd: priced.amountUsd,
          flightNumber: priced.flightNumber,
        })
      : null;
    segments.push({
      mode: "flight",
      label: `${leg.fromIata} → ${leg.toIata}`,
      detail: priced.airline
        ? `${priced.airline} · live Duffel${book ? ` · ${book.label}` : ""}`
        : "Live Duffel · Kepi Wave Search",
      costUsd: priced.amountUsd ?? 0,
    });
  }

  for (const ground of row.groundLegs) {
    segments.push({
      mode: "train",
      label: ground.label,
      detail: ground.detail,
      costUsd: ground.costUsd,
    });
  }

  return segments;
}

export function topologyToStrategy(row: PricedTopology, rank: number): TravelStrategy {
  const kind = kindForTopology(row);
  const segments = segmentsFromTopology(row);
  const savingsBit =
    row.savingsVsBaselineUsd > 0
      ? ` Saves ~$${row.savingsVsBaselineUsd.toLocaleString()} vs simple round-trip.`
      : "";

  return {
    id: `topology-${row.candidate.id}`,
    kind,
    title: row.candidate.title,
    headline: row.candidate.headline,
    reasoning: `${row.candidate.savingsDna}${savingsBit} (${row.liveLegCount}/${row.totalFlightLegs} flight legs live-priced · Kepi Wave Search).`,
    segments,
    scores: {
      tvs: Math.min(99, 88 + Math.min(10, row.savingsVsBaselinePct / 5)),
      trueOutOfPocket: row.totalCashUsd,
      totalTripValue: row.totalTripValue,
      bestCpp: row.totalAwardMiles > 0 ? 2.0 : 0,
      sortKey: row.totalTripValue + row.frictionMinutes * 2,
      frictionMinutes: row.frictionMinutes,
      comfortScore: row.frictionMinutes > 120 ? 72 : 85,
      valueScore: Math.min(99, 70 + row.savingsVsBaselinePct),
      statusScore: 50,
      confidence: row.confidence === "live" ? 0.95 : row.confidence === "mixed" ? 0.82 : 0.65,
    },
    instrumentsUsed: [],
    preCrimeWarnings:
      row.candidate.kind === "position_award"
        ? ["Award space is estimated — verify on Seats.aero before booking."]
        : [],
    departureAirports: [row.candidate.homeAirport],
    recommended: rank === 1,
    valueRank: rank,
    rankExplanation: `Wave Search rank #${rank} · ${row.candidate.savingsDna}`,
  };
}

export function mergeTopologyIntoStrategies(
  strategies: TravelStrategy[],
  topology: TopologySearchResult | null | undefined,
): TravelStrategy[] {
  if (!topology?.winners.length) return strategies;

  const topologyStrategies = topology.winners.map((row, index) => topologyToStrategy(row, index + 1));
  const legacy = strategies.map((s) => ({ ...s, recommended: false }));
  const merged = [...topologyStrategies, ...legacy];

  return merged.map((s, index) => ({
    ...s,
    valueRank: index + 1,
    recommended: index === 0,
  }));
}

export function attachTopologyMetadata(
  brief: { strategies: TravelStrategy[]; strategyCatalog?: TravelStrategy[] },
  topology: TopologySearchResult,
): void {
  const attach = (list: TravelStrategy[]) =>
    list.map((s) => {
      if (!s.id.startsWith("topology-")) return s;
      const winner = topology.winners.find((w) => `topology-${w.candidate.id}` === s.id);
      if (!winner) return s;
      return {
        ...s,
        reasoning: `${s.reasoning} Wave Search: ${topology.duffelCallsUsed} live searches · ${topology.candidatesPruned} shapes pruned.`,
      };
    });

  brief.strategies = attach(brief.strategies);
  if (brief.strategyCatalog) {
    brief.strategyCatalog = attach(brief.strategyCatalog);
  }
}
