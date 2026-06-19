/** Kepi Wave Search — trip topology types */

export type TopologyKind =
  | "naive_roundtrip"
  | "open_jaw"
  | "gateway_sweep"
  | "return_sweep"
  | "position_cash"
  | "position_award"
  | "ground_connector";

export type TopologyLegRole = "outbound" | "return" | "feeder" | "longhaul" | "connector";

export type TopologyLegPricing = "cash_live" | "award_estimate" | "ground_model";

export interface TopologyFlightLeg {
  id: string;
  role: TopologyLegRole;
  fromIata: string;
  toIata: string;
  fromLabel: string;
  toLabel: string;
  departureDate: string;
  pricing: TopologyLegPricing;
}

export interface TopologyGroundLeg {
  id: string;
  label: string;
  detail: string;
  costUsd: number;
}

export interface TripTopologyCandidate {
  id: string;
  kind: TopologyKind;
  title: string;
  headline: string;
  reasoning: string;
  /** One-line explanation of why this shape exists — the "savings DNA" */
  savingsDna: string;
  flightLegs: TopologyFlightLeg[];
  groundLegs: TopologyGroundLeg[];
  frictionMinutes: number;
  /** Lower = search first */
  wave: number;
  /** Heuristic lower bound before live pricing — used for pruning */
  estimateLowerBoundUsd: number;
  homeAirport: string;
  arrivalAirport: string;
  returnAirport: string;
}

export interface PricedTopologyLeg {
  leg: TopologyFlightLeg;
  priced: boolean;
  amountUsd?: number;
  currency?: string;
  airline?: string;
  stops?: number;
  offerId?: string;
  flightNumber?: string;
  awardMiles?: number;
  verifyUrl?: string;
}

export interface PricedTopology {
  candidate: TripTopologyCandidate;
  legs: PricedTopologyLeg[];
  groundLegs: TopologyGroundLeg[];
  totalCashUsd: number;
  totalAwardMiles: number;
  imputedPointsUsd: number;
  totalTripValue: number;
  frictionMinutes: number;
  confidence: "live" | "mixed" | "estimated";
  liveLegCount: number;
  totalFlightLegs: number;
  savingsVsBaselineUsd: number;
  savingsVsBaselinePct: number;
}

export interface TopologySearchResult {
  algorithm: "kepi-wave-search";
  version: 1;
  candidatesGenerated: number;
  candidatesPriced: number;
  candidatesPruned: number;
  duffelCallsUsed: number;
  baseline: PricedTopology | null;
  winners: PricedTopology[];
  bestSavingsUsd: number;
  bestSavingsPct: number;
  routeSummary: string;
  headline: string;
}
