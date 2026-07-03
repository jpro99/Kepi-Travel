export interface GeoAirport {
  iata: string;
  name: string;
  driveMinutes: number;
  isPrimary?: boolean;
}

export interface StatusEntry {
  program: string;
  airline?: string;
  hotelChain?: string;
  tier: string;
  alliance?: "Star Alliance" | "Oneworld" | "SkyTeam";
  expiresAt?: string;
  loungeAccess: boolean;
  prioritySecurity: boolean;
  freeCheckedBags: number;
}

export interface PointsBalance {
  program: string;
  balance: number;
  transferableFrom?: string[];
  baselineCpp: number;
}

export interface TravelInstrument {
  id: string;
  type:
    | "upgrade_certificate"
    | "companion_certificate"
    | "suite_certificate"
    | "free_night_award"
    | "guest_upgrade";
  program: string;
  label: string;
  quantity: number;
  expiresAt?: string;
  estimatedValueUsd: number;
}

export interface DecisionWeights {
  comfort: number;
  value: number;
  status: number;
}

export interface GenomeCorrection {
  id: string;
  createdAt: string;
  override: string;
  context: string;
}

export interface SavedPassengerDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: "m" | "f";
  passportNumber?: string;
  passportExpiry?: string;
  passportCountry?: string;
}

export interface TravelStyleScores {
  quick_board: number;
  route_scout: number;
  travel_companion: number;
  flight_plan: number;
}

export type TravelStyleMode = keyof TravelStyleScores;

export interface TravelStyleProfile {
  completed: boolean;
  skipped?: boolean;
  /** Scores from the ten-question travel quiz (0–1 each). */
  scores: TravelStyleScores;
  dominant: TravelStyleMode;
  completedAt?: string;
  /** Pro: manual slider mix (0–1 each). When set, overrides dominant for UX. */
  guidanceMix?: TravelStyleScores;
  mixCustomized?: boolean;
}

export interface TravelerGenome {
  /** Loyalty program balances — updated by user */
  loyaltyBalances?: {
    programId: string;
    miles: number;
    tier?: string;
    memberNumber?: string;
    segmentsYtd?: number;
    nightsYtd?: number;
    progressBaselineAt?: string;
  }[];
  /** Post-trip feedback used by the trip-learning engine — see src/lib/learning/tripInsights.ts */
  tripRatings?: import("@/lib/learning/tripInsights").TripRating[];
  /** Prefilled from the most recent checkout — see src/app/api/orders/create/route.ts */
  savedPassengerDetails?: SavedPassengerDetails;
  userId: string;
  homeRegion: string;
  geoCluster: GeoAirport[];
  statuses: StatusEntry[];
  pointsBalances: PointsBalance[];
  instruments: TravelInstrument[];
  decisionWeights: DecisionWeights;
  hotelChainPriority: string[];
  cabinPreference: "economy" | "premium_economy" | "business" | "first";
  toleratesRepositioning: boolean;
  toleratesRedeye: boolean;
  prefersNonstop: boolean;
  corrections: GenomeCorrection[];
  tripCount: number;
  updatedAt: string;
  /** Lightweight travel-style quiz — tunes UX tone and detail level */
  travelStyle?: TravelStyleProfile;
}
