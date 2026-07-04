// src/lib/flights/types.ts
// Shared types for Kepi's fused (cash + award) flight search.
// v2: adds per-offer metrics, composite scoring, and passenger-aware fields so
// the cash-vs-points comparison is correct for multi-traveler trips.

export type CabinClass = "economy" | "premium_economy" | "business" | "first";

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
  origin: string; // IATA
  destination: string; // IATA
  departingAt: string; // ISO
  arrivingAt: string; // ISO
  marketingCarrier: string; // e.g. "UA"
  flightNumber: string;
  aircraft?: string;
}

// A cash offer, normalized from Duffel. totalAmount is for ALL passengers.
export interface CashOffer {
  kind: "cash";
  id: string;
  totalAmount: number; // cents, all passengers
  currency: string;
  cabin: CabinClass;
  segments: FlightSegment[];
  source: "duffel";
}

// An award offer. milesCost and cashSurcharge are PER PASSENGER (Seats.aero
// reports per person). The orchestrator multiplies by passenger count when
// comparing against cash totals.
export interface AwardOffer {
  kind: "award";
  id: string;
  program: LoyaltyProgram;
  milesCost: number; // per passenger
  cashSurcharge: number; // per passenger, cents
  currency: string;
  cabin: CabinClass;
  segments: FlightSegment[];
  source: "seats_aero" | string;
  surchargeHeavy?: boolean;
  rawAvailabilityId?: string;
}

export type AnyOffer = CashOffer | AwardOffer;

// Convenience metrics derived from segments, used by the scorer.
export interface OfferMetrics {
  stops: number;
  durationMinutes: number | null; // null when unknown (e.g. award stub data)
}

// Composite score breakdown (each sub-score 0..1; composite 0..100).
export interface ScoreBreakdown {
  value: number;
  convenience: number;
  reachability: number;
  quality: number;
  composite: number;
}

export interface FusedOffer {
  offer: AnyOffer;
  cashEquivalent: number; // cents, ALL passengers — the true effective cost
  centsPerPoint?: number; // award only — value extracted vs matched cash fare
  isBestValue: boolean;
  reachable?: boolean;
  reachableVia?: ReachabilityPath[];
  recommendationReason?: string;
  metrics?: OfferMetrics;
  score?: number; // 0..100
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
  departDate: string; // YYYY-MM-DD
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
