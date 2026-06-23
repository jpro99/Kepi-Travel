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
  /** Full airline name from Duffel — used for booking links */
  airlineName?: string;
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
  /** IATA where this offer was found (cash origin or award search origin). */
  searchOrigin?: string;
  /** Award found via a West Coast gateway, not the traveler's home airport. */
  isGatewayPlay?: boolean;
  feederOrigin?: string;
  feederCashUsd?: number;
  gatewayPlayTitle?: string;
}

export interface OriginCashRow {
  origin: string;
  totalAmount: number;
  currency: string;
  airline: string;
  stops: number;
  offerId: string;
  cabin: CabinClass;
  departureDate: string;
}

/** Cheapest (by cash-equivalent value) live award per origin — points/miles counterpart to OriginCashRow. */
export interface OriginAwardRow {
  origin: string;
  milesCost: number;
  program: LoyaltyProgram;
  /** Realized cents-per-point vs the cheapest comparable cash fare, when one exists. */
  centsPerPoint?: number;
  pricingSource: "live";
  stops: number;
  cabin: CabinClass;
  departureDate: string;
  isGatewayPlay: boolean;
  feederOrigin?: string;
  feederCashUsd?: number;
  offerId?: string;
}

export interface AlaskaUpgradeCandidate {
  origin: string;
  destination: string;
  departureDate: string;
  cashUsd: number;
  airline: string;
  offerId?: string;
  cabin: CabinClass;
  instrumentLabel: string;
  detail: string;
  bookUrl: string;
  bookLabel: string;
}

export interface CabinSearchSlice {
  cabin: CabinClass;
  offers: FusedOffer[];
  cheapestCash?: FusedOffer;
  bestAward?: FusedOffer;
  originCashLeaderboard?: OriginCashRow[];
  originAwardLeaderboard?: OriginAwardRow[];
  gatewayPlays?: FusedOffer[];
  headline?: string;
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
  /** Live Duffel cash from each nearby origin — sorted cheapest first. */
  originCashLeaderboard?: OriginCashRow[];
  /** Live award from each nearby origin (locals + West Coast gateways) — sorted cheapest cash-equivalent first. */
  originAwardLeaderboard?: OriginAwardRow[];
  /** Best award from a West Coast gateway when home airport has no space. */
  gatewayPlays?: FusedOffer[];
  /** Economy + business slices when both are searched */
  cabinsSearched?: CabinClass[];
  byCabin?: Partial<Record<CabinClass, CabinSearchSlice>>;
  /** Alaska-metal fares where a Guest Upgrade Certificate may apply */
  alaskaUpgradeCandidates?: AlaskaUpgradeCandidate[];
  headline?: string;
  warnings: string[];
  meta: {
    cashCount: number;
    awardCount: number;
    cashCached: boolean;
    awardCached: boolean;
    elapsedMs: number;
    cashOriginsSearched: string[];
    awardOriginsSearched: string[];
    awardGatewaysSearched: string[];
  };
}
