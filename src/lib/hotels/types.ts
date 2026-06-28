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
  lat?: number;
  lng?: number;
  /** No live rate in Kepi — open Google Hotels for pricing. */
  browseOnly?: boolean;
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
  /** Human label for rank within this search (e.g. "#1 for your search"). */
  cityRankLabel?: string;
  /** Property sits in the town the user searched (vs wider area inventory). */
  inSearchCity?: boolean;
}
