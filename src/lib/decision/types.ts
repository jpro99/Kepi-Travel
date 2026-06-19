import type { AlignmentLeg } from "@/lib/decision/tripAlignment";
import type { TravelerGenome } from "@/lib/traveler/types";
import type { TopologySearchResult } from "@/lib/decision/topology/types";

export type StrategyKind =
  | "direct_cash"
  | "reposition_award"
  | "instrument_play"
  | "status_play";

export interface TripStop {
  name: string;
  region?: string;
  iata?: string;
  nights?: number;
  nightsLabel?: string;
}

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
  /** Parsed home / departure area */
  originCity?: string;
  originRegion?: string;
  originAirports?: string[];
  /** Open-jaw return — fly home from a different city than arrival region */
  returnCity?: string;
  returnRegion?: string;
  returnAirports?: string[];
  /** Multi-city legs in visit order */
  stops?: TripStop[];
  loyaltyPrograms?: string[];
  preferredAirlines?: string[];
  budgetHint?: string;
  isMultiCity?: boolean;
}

export interface FlightLegPlan {
  id: string;
  role: "outbound" | "return" | "connector";
  fromIata: string;
  toIata: string;
  fromLabel: string;
  toLabel: string;
  enabled: boolean;
  optional: boolean;
  departureDate: string;
  /** Shown when status airline cannot operate this leg (e.g. Alaska on EU connectors). */
  loyaltyNote?: string;
}

export type PlanMode = "flights" | "hotels" | "full";

export type PaymentMode = "cash" | "points" | "mix";

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
  /** Cash + points valued at segment ¢/pt — used for rank order */
  totalTripValue?: number;
  /** Best flight redemption ¢/mi on this play */
  bestCpp?: number;
  /** Internal sort key (includes reposition penalty) */
  sortKey?: number;
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
  /** Rank by total trip value (#1 = cheapest overall) */
  valueRank?: number;
  /** Status Play flagged when status goals outweigh pure cost rank */
  statusRecommended?: boolean;
  statusRecommendReason?: string;
  /** Expert mode — why this strategy landed at its rank. */
  rankExplanation?: string;
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
    offerId?: string;
    flightNumber?: string;
    departureDate?: string;
  };
  returnOffer?: {
    origin: string;
    destination: string;
    amount: number;
    currency: string;
    airline: string;
    stops: number;
    offerId?: string;
    flightNumber?: string;
    departureDate?: string;
  };
  roundTripTotalUsd?: number;
  connectorOffers?: Array<{
    legId: string;
    origin: string;
    destination: string;
    amount: number;
    currency: string;
    airline: string;
    stops: number;
    offerId?: string;
    flightNumber?: string;
    departureDate?: string;
  }>;
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
  /** True when international trip has no parsed departure — user must name origin airport. */
  originRequired?: boolean;
  planMode?: PlanMode;
  paymentMode?: PaymentMode;
  /** Full ranked strategies before payment-mode filter (for UI toggles). */
  strategyCatalog?: TravelStrategy[];
  flightLegs?: FlightLegPlan[];
  livePricing?: LivePricingSummary;
  /** Kepi Wave Search — combinatorial trip topology results vs naive baseline */
  topologySearch?: TopologySearchResult;
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

/** Hotel picked on the Command Deck — carried into trip activation. */
export interface SelectedStayActivation {
  quoteId: string;
  name: string;
  chainName?: string;
  photoUrl?: string;
  area?: string;
  totalAmountUsd: number;
  nightlyUsd: number;
  currency: string;
  checkInDate: string;
  checkOutDate: string;
}

export interface ActivateStrategyResult {
  tripId: string;
  tripName: string;
  redirectPath: string;
  alignmentLegs: AlignmentLeg[];
  verifiedLegCount: number;
  totalBookableLegs: number;
}

export type FlexPricingSource = "live" | "estimated" | "mixed";

export interface StrategyFlexOption {
  rank: number;
  departureDate: string;
  dateShiftDays: number;
  dateLabel: string;
  headline: string;
  trueOutOfPocket: number;
  milesUsed?: number;
  centsPerMile?: number;
  cashFareUsd?: number;
  pricingSource: FlexPricingSource;
  detail: string;
  savingsVsBaseline?: number;
  verifyUrl?: string;
  benchmarkNote?: string;
}

export interface StrategyFlexOptionsResult {
  strategyId: string;
  strategyTitle: string;
  kind: StrategyKind;
  baselineDate: string;
  notice: string;
  options: StrategyFlexOption[];
}
