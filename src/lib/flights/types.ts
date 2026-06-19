export type FlightCabin = "economy" | "premium_economy" | "business" | "first";

export interface CashOffer {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  airline: string;
  flightNumber?: string;
  stops: number;
  cabin: FlightCabin;
  totalUsd: number;
  currency: string;
  offerId?: string;
  source: "duffel";
}

export interface AwardOffer {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  program: string;
  programSlug: string;
  miles: number;
  taxesUsd: number;
  cabin: FlightCabin;
  airlines: string;
  direct: boolean;
  remainingSeats: number;
  availabilityId: string;
  verifyUrl: string;
  source: "seats_aero";
  /** Bank points program used to fund transfer, if applicable */
  fundedBy?: string;
  transferFrom?: string;
}

export type PaymentVerdict = "use_cash" | "use_points" | "transfer_points" | "insufficient_points";

export interface FusedFlightOption {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  cabin: FlightCabin;
  cashOffer: CashOffer | null;
  awardOffer: AwardOffer | null;
  verdict: PaymentVerdict;
  headline: string;
  reasoning: string;
  cpp: number;
  cashUsd: number;
  milesRequired: number;
  imputedPointsUsd: number;
  savingsUsd: number;
  rankScore: number;
}

export interface FusedFlightSearchParams {
  origins: string[];
  destination: string;
  departureDate: string;
  returnDate?: string;
  cabin?: FlightCabin;
}

export interface FusedFlightSearchResult {
  params: FusedFlightSearchParams;
  cashOffers: CashOffer[];
  awardOffers: AwardOffer[];
  fused: FusedFlightOption[];
  headline: string;
  best: FusedFlightOption | null;
  meta: {
    cashSource: "duffel" | "none";
    awardSource: "seats_aero" | "none";
    duffelConfigured: boolean;
    seatsAeroConfigured: boolean;
  };
}
