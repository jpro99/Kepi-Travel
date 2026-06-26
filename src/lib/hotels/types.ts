export interface HotelSearchResult {
  id: string;
  name: string;
  chainName?: string;
  stars: number;
  rating?: number;
  ratingCount?: number;
  pricePerNight: number;
  totalPrice: number;
  currency: string;
  nights: number;
  address: string;
  city: string;
  checkIn: string;
  checkOut: string;
  amenities: string[];
  photos: string[];
  rooms: number;
  guests: number;
  cancellable: boolean;
  cancellationDeadline?: string;
}

export type HotelSearchTier =
  | "kepi_pick"
  | "best_value"
  | "best_quality"
  | "points_play"
  | "personal"
  | "solid";

export interface HotelPointsOption {
  programId: string;
  programName: string;
  milesNeeded: number;
  cppAchieved: number;
  cppBaseline: number;
  recommendation: "use" | "consider" | "avoid";
  reason: string;
  transferableFrom?: string;
}

export interface RankedHotelSearchResult extends HotelSearchResult {
  rank: number;
  fitScore: number;
  tier: HotelSearchTier;
  whyLine: string;
  badges: string[];
  qualityScore: number;
  valueScore: number;
  pointsOption?: HotelPointsOption;
}
