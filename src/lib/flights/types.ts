// Shared types for Kepi's fused (cash + award) flight search.
// v2: per-offer metrics, composite scoring, passenger-aware comparison.

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

/** @deprecated Use CabinClass */
export type FlightCabin = CabinClass;

export type LoyaltyProgram =
  | "united"
  | "american"
  | "delta"
  | "alaska"
  | "jetblue"
  | "southwest"
  | "aeroplan"
  | "flyingblue"
  | "avios_ba"
  | "avios_iberia"
  | "virginatlantic"
  | "lifemiles"
  | "singapore_krisflyer"
  | "ana"
  | "emirates"
  | "etihad"
  | "qatar_avios"
  | "turkish"
  | "chase_ur"
  | "amex_mr"
  | "capitalone"
  | "citi_typ"
  | "bilt"
  | "wellsfargo";

export interface FlightSegment {
  origin: string;
  destination: string;
  departingAt: string;
  arrivingAt: string;
  marketingCarrier: string;
  flightNumber: string;
  aircraft?: string;
}

export interface CashOffer {
  kind: "cash";
  id: string;
  totalAmount: number;
  currency: string;
  cabin: CabinClass;
  segments: FlightSegment[];
  source: "duffel";
}

export interface AwardOffer {
  kind: "award";
  id: string;
  program: LoyaltyProgram;
  milesCost: number;
  cashSurcharge: number;
  currency: string;
  cabin: CabinClass;
  segments: FlightSegment[];
  source: "seats_aero" | string;
  surchargeHeavy?: boolean;
  rawAvailabilityId?: string;
}

export type AnyOffer = CashOffer | AwardOffer;

export interface OfferMetrics {
  stops: number;
  durationMinutes: number | null;
}

export interface ScoreBreakdown {
  value: number;
  convenience: number;
  reachability: number;
  quality: number;
  composite: number;
}

export interface FusedOffer {
  offer: AnyOffer;
  cashEquivalent: number;
  centsPerPoint?: number;
  isBestValue: boolean;
  reachable?: boolean;
  reachableVia?: ReachabilityPath[];
  recommendationReason?: string;
  metrics?: OfferMetrics;
  score?: number;
  scoreBreakdown?: ScoreBreakdown;
}

export interface ReachabilityPath {
  fromCurrency: LoyaltyProgram;
  toProgram: LoyaltyProgram;
  ratio: string;
  transferBonusPct?: number;
  hasEnoughBalance: boolean;
  shortfall?: number;
}

export interface FusedSearchParams {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  passengers: number;
  cabin: CabinClass;
  userId?: string;
}

export interface FusedSearchResult {
  params: FusedSearchParams;
  offers: FusedOffer[];
  cheapestCash?: FusedOffer;
  bestAward?: FusedOffer;
  headline?: string;
  warnings: string[];
  meta: {
    cashCount: number;
    awardCount: number;
    cashCached: boolean;
    awardCached: boolean;
    elapsedMs: number;
  };
}
