/** Plan City — pre-trip day planner with provenance (F20). */

export type PlanCityStopKind =
  | "church"
  | "museum"
  | "walk"
  | "viewpoint"
  | "food"
  | "gelato"
  | "other";

export type PlanCitySourceKind =
  | "official_text"
  | "osm"
  | "licensed_reviews"
  | "traveler_saved";

export type PlanCityPace = "easy" | "full" | "ambitious";

export interface PlanCityStopSource {
  kind: PlanCitySourceKind;
  /** Human label — e.g. OpenStreetMap, Comune di Lecce turismo. */
  label: string;
  /** OSM node/way/relation id, official doc id, or traveler capture id. */
  ref: string;
  url?: string;
}

export interface PlanCityDwell {
  /** Minutes on site when officially published; omit when unknown. */
  minutes?: number;
  unknown: boolean;
  /** Where dwell came from when minutes is set. */
  provenance?: string;
}

export interface PlanCityStop {
  id: string;
  name: string;
  kind: PlanCityStopKind;
  lat: number;
  lng: number;
  dwell: PlanCityDwell;
  source: PlanCityStopSource;
  /** Which pace tiers include this stop in the catalog (never invents POIs). */
  paceTags: PlanCityPace[];
  /** Optional secondary official list reference id on the catalog. */
  officialListRef?: string;
}

export interface PlanCityCatalogSource {
  id: string;
  kind: PlanCitySourceKind;
  label: string;
  url?: string;
}

export interface PlanCityCatalog {
  cityId: string;
  cityLabel: string;
  verifiedAt: string;
  sources: PlanCityCatalogSource[];
  stops: PlanCityStop[];
}

export interface PlanCityWalkGap {
  fromStopId: string;
  toStopId: string;
  distanceM: number | null;
  durationSec: number | null;
  routingSource: "openrouteservice" | "osrm" | "none";
  /** True when routing engine returned no path — never invent drive time. */
  unavailable: boolean;
}

export interface PlanCityMyDayStop {
  stopId: string;
  walkGapFromPrevious?: PlanCityWalkGap | null;
}
