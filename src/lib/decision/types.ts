import type { TravelerGenome } from "@/lib/traveler/types";

export type StrategyKind =
  | "direct_cash"
  | "reposition_award"
  | "instrument_play"
  | "status_play";

export interface TripIntent {
  rawPrompt: string;
  destination: string;
  destinationIata: string;
  region: string;
  monthLabel: string;
  startDate: string;
  endDate: string;
  nights: number;
  seasonNote: string;
}

export interface StrategySegment {
  mode: "drive" | "flight" | "hotel" | "train";
  label: string;
  detail: string;
  costUsd: number;
  milesUsed?: number;
  cpp?: number;
}

export interface InstrumentUsage {
  instrumentId: string;
  label: string;
  valueUsd: number;
  optimal: boolean;
  warning?: string;
}

export interface StrategyScores {
  tvs: number;
  trueOutOfPocket: number;
  frictionMinutes: number;
  comfortScore: number;
  valueScore: number;
  statusScore: number;
  confidence: number;
}

export interface TravelStrategy {
  id: string;
  kind: StrategyKind;
  title: string;
  headline: string;
  reasoning: string;
  segments: StrategySegment[];
  scores: StrategyScores;
  instrumentsUsed: InstrumentUsage[];
  preCrimeWarnings: string[];
  departureAirports: string[];
  recommended: boolean;
}

export interface DecisionQuestion {
  id: string;
  prompt: string;
  stakes: string;
  flipsRanking: boolean;
  options: Array<{ id: string; label: string; genomeOverride?: string }>;
}

export interface LivePricingSummary {
  source: "duffel";
  configured: boolean;
  quotesFound: number;
  bestOffer?: {
    origin: string;
    destination: string;
    amount: number;
    currency: string;
    airline: string;
    stops: number;
  };
  searchedOrigins?: string[];
  message?: string;
}

export interface DecisionBrief {
  intent: TripIntent;
  inferredSummary: string;
  searchAirports: string[];
  strategies: TravelStrategy[];
  questions: DecisionQuestion[];
  instrumentHighlights: string[];
  livePricing?: LivePricingSummary;
  genomeSnapshot: Pick<
    TravelerGenome,
    "homeRegion" | "decisionWeights" | "hotelChainPriority" | "tripCount"
  >;
}

export interface CounterfactualMutation {
  dateShiftDays?: number;
  priorityComfort?: number;
  willingToReposition?: boolean;
}

export interface CounterfactualResult {
  originalTopId: string;
  newTopId: string;
  rankingChanged: boolean;
  deltas: Array<{
    strategyId: string;
    title: string;
    tvsDelta: number;
    summary: string;
  }>;
}

export interface ActivateStrategyResult {
  tripId: string;
  tripName: string;
  redirectPath: string;
}
