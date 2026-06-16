export interface DuffelFlightQuote {
  origin: string;
  destination: string;
  departureDate: string;
  totalAmountUsd: number;
  currency: string;
  airline: string;
  cabinClass: string;
  stops: number;
  offerId: string;
}

export interface DuffelSearchResult {
  configured: boolean;
  quotes: DuffelFlightQuote[];
  error?: string;
}

export interface DuffelStayQuote {
  id: string;
  name: string;
  chainName?: string;
  ratingStars?: number;
  reviewScore?: number;
  photoUrl?: string;
  area?: string;
  totalAmountUsd: number;
  currency: string;
  nightlyUsd: number;
}

export interface DuffelStaysResult {
  configured: boolean;
  stays: DuffelStayQuote[];
  error?: string;
  source?: "duffel" | "estimated";
}
