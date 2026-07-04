// src/lib/flights/types.ts
// Shared types for Kepi's fused (cash + award) flight search.
// These intentionally mirror the shape of Duffel offers where possible so the
// existing Command Deck UI can consume award results with minimal new mapping.

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
  // Transferable bank currencies
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

// A cash offer, normalized from Duffel.
export interface CashOffer {
  kind: "cash";
  id: string;
  totalAmount: number; // in cents
  currency: string; // e.g. "USD"
  cabin: CabinClass;
  segments: FlightSegment[];
  source: "duffel";
}

// An award offer, normalized from Seats.aero (or any award source).
export interface AwardOffer {
  kind: "award";
  id: string;
  program: LoyaltyProgram; // program that tickets this award
  milesCost: number; // miles/points required
  cashSurcharge: number; // taxes + carrier-imposed surcharges, in cents
  currency: string;
  cabin: CabinClass;
  segments: FlightSegment[];
  source: "seats_aero" | string;
  // Whether the surcharge is known to be heavy for this program/route.
  surchargeHeavy?: boolean;
  rawAvailabilityId?: string; // pass-through for booking handoff
}

export type AnyOffer = CashOffer | AwardOffer;

// The unified, ranked result Kepi shows the user.
export interface FusedOffer {
  offer: AnyOffer;
  // Everything below is the comparison intelligence layered on top.
  cashEquivalent: number; // cents — what this option effectively "costs" in USD
  centsPerPoint?: number; // only for award offers (value extracted)
  isBestValue: boolean;
  // For award offers: can the user actually reach this with what they hold?
  reachable?: boolean;
  reachableVia?: ReachabilityPath[];
  recommendationReason?: string; // human-readable "why" for the UI
}

export interface ReachabilityPath {
  fromCurrency: LoyaltyProgram; // what the user holds
  toProgram: LoyaltyProgram; // where it needs to go
  ratio: string; // e.g. "1:1"
  transferBonusPct?: number; // active bonus, if any
  hasEnoughBalance: boolean;
  shortfall?: number; // miles short, if not enough
}

export interface FusedSearchParams {
  origin: string;
  destination: string;
  departDate: string; // YYYY-MM-DD
  returnDate?: string;
  passengers: number;
  cabin: CabinClass;
  userId?: string; // to pull loyalty balances + personalize
}

export interface FusedSearchResult {
  params: FusedSearchParams;
  offers: FusedOffer[];
  cheapestCash?: FusedOffer;
  bestAward?: FusedOffer;
  headline?: string; // the single-sentence "best play" Kepi surfaces
  warnings: string[]; // degraded-source notices, etc.
}
