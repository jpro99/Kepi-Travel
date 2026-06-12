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
