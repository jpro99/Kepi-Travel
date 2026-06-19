import { allocateStopDates, formatStopRoute } from "@/lib/decision/stopDates";
import type { DecisionBrief, TravelStrategy, TripIntent } from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";
import { buildQuestionBudget } from "@/lib/decision/questionBudget";

function estimatedNightlyUsd(iata: string, chainPriority: string[]): number {
  const premium = chainPriority.some((chain) => /hyatt|marriott|hilton/i.test(chain));
  const europe = ["FCO", "VCE", "BRI", "FLR", "MXP", "CDG", "MUC", "BER", "FRA"].includes(
    iata.toUpperCase(),
  );
  if (premium && europe) return 220;
  if (europe) return 165;
  return premium ? 195 : 145;
}

export function buildHotelsOnlyStrategy(intent: TripIntent, genome: TravelerGenome): TravelStrategy {
  const stopDates = allocateStopDates(intent);
  const ranges =
    stopDates.length > 0
      ? stopDates
      : [
          {
            stop: { name: intent.destination, iata: intent.destinationIata, nights: intent.nights },
            checkIn: intent.startDate,
            checkOut: intent.endDate,
            nights: intent.nights,
          },
        ];

  const segments = ranges.map((range) => {
    const iata = range.stop.iata ?? intent.destinationIata;
    const nightly = estimatedNightlyUsd(iata, genome.hotelChainPriority);
    return {
      mode: "hotel" as const,
      label: range.stop.name,
      detail: `${range.nights} nights · ${range.checkIn} → ${range.checkOut}`,
      costUsd: Math.round(nightly * range.nights),
    };
  });

  const trueOutOfPocket = segments.reduce((sum, segment) => sum + segment.costUsd, 0);
  const routeLabel =
    intent.stops && intent.stops.length > 0
      ? formatStopRoute(intent.stops)
      : intent.destination;

  return {
    id: "hotels-only",
    kind: "direct_cash",
    title: "Hotel stay plan",
    headline: `${routeLabel} · ${intent.nights} nights · hotels only`,
    reasoning: `Hotels mode — Kepi ranks stays per city for your dates. Pick a property and activate; add flights later in Flights mode.`,
    segments,
    scores: {
      trueOutOfPocket,
      totalTripValue: trueOutOfPocket,
      valueScore: 75,
      comfortScore: 80,
      statusScore: 40,
      frictionMinutes: 15,
      tvs: 82,
      bestCpp: 0,
      sortKey: trueOutOfPocket,
    },
    instrumentsUsed: [],
    preCrimeWarnings: [],
    departureAirports: [],
    recommended: true,
    valueRank: 1,
  };
}

export function buildHotelsInferredSummary(intent: TripIntent): string {
  const stops = intent.stops ?? [];
  if (stops.length > 0) {
    return `Hotels across ${formatStopRoute(stops)} · ${intent.monthLabel} · ${intent.nights} nights total`;
  }
  return `${intent.destination} · ${intent.monthLabel} · ${intent.nights} nights`;
}

export function buildHotelsOnlyBrief(
  intent: TripIntent,
  genome: TravelerGenome,
): Pick<
  DecisionBrief,
  "inferredSummary" | "searchAirports" | "strategies" | "strategyCatalog" | "questions" | "flightLegs"
> {
  const strategy = buildHotelsOnlyStrategy(intent, genome);
  return {
    inferredSummary: buildHotelsInferredSummary(intent),
    searchAirports: [],
    strategies: [strategy],
    strategyCatalog: [strategy],
    flightLegs: [],
    questions: buildQuestionBudget([strategy], genome, intent),
  };
}
