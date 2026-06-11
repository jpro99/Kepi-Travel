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

export interface TravelerGenome {
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
}
