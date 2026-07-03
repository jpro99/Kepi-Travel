export interface TravelFitReservation {
  id: string;
  type: string;
  provider?: string;
  title?: string;
  location?: string;
  localTime?: string;
  checkOutDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDate?: string;
}

export interface AirlineHabit {
  airlineCode: string;
  label: string;
  segmentCount: number;
  share: number;
}

export interface DestinationHabit {
  iataOrCity: string;
  label: string;
  visitCount: number;
}

export interface HotelChainHabit {
  chain: string;
  stayCount: number;
  avgNightlyUsd: number | null;
}

export interface LearnedTravelHabits {
  userId: string;
  updatedAt: string;
  tripCount: number;
  flightSegmentCount: number;
  hotelStayCount: number;
  topAirlines: AirlineHabit[];
  topDestinations: DestinationHabit[];
  topHotelChains: HotelChainHabit[];
  typicalHotelNightlyUsd: number | null;
  primaryHomeAirports: string[];
  confidence: "low" | "growing" | "strong";
}

export interface StatusProjection {
  program: string;
  currentTier?: string;
  metricLabel: string;
  currentValue: number;
  targetValue: number;
  projectedValue: number;
  onTrack: boolean;
  headline: string;
  detail: string;
}

export interface ProgramFitScore {
  program: string;
  kind: "airline" | "hotel";
  score: number;
  recommended: boolean;
  reasons: string[];
  cautions: string[];
}

export interface CardEarnHint {
  cardId: string;
  cardName: string;
  reason: string;
  estimatedMultiplier: string;
}

export interface EarnStackSuggestion {
  headline: string;
  steps: string[];
  cardHint: CardEarnHint | null;
  portalHint: string | null;
  disclaimer: string;
}

export interface TravelFitReport {
  generatedAt: string;
  habits: LearnedTravelHabits;
  learningMessage: string;
  airlineFit: ProgramFitScore[];
  hotelFit: ProgramFitScore[];
  statusProjections: StatusProjection[];
  topRecommendation: string;
  earnStackPreview: EarnStackSuggestion | null;
}
