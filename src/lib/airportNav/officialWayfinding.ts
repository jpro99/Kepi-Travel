export type AirportWayfindingKind =
  | "official_live_indoor"
  | "official_interactive"
  | "official_map"
  | "universal_map";

export interface AirportWayfindingResource {
  iata: string;
  label: string;
  provider: string;
  url: string;
  kind: AirportWayfindingKind;
  official: boolean;
  supportsCurrentLocation: boolean;
  supportsStepByStep: boolean;
  availableOffline: boolean;
  verifiedAt: string | null;
}

const VERIFIED_AIRPORT_WAYFINDING: Record<string, AirportWayfindingResource> = {
  SEA: {
    iata: "SEA",
    label: "Open SEA live indoor directions",
    provider: "SEA Airport · Atrius Maps",
    url: "https://maps.flysea.org/",
    kind: "official_live_indoor",
    official: true,
    supportsCurrentLocation: true,
    supportsStepByStep: true,
    availableOffline: false,
    verifiedAt: "2026-07-13",
  },
  FCO: {
    iata: "FCO",
    label: "Open FCO digital airport map",
    provider: "Aeroporti di Roma · Digiport/Airsiders",
    url: "https://www.adr.it/web/aeroporti-di-roma-en/digital-airport",
    kind: "official_live_indoor",
    official: true,
    supportsCurrentLocation: false,
    supportsStepByStep: true,
    availableOffline: false,
    verifiedAt: "2026-07-13",
  },
  MUC: {
    iata: "MUC",
    label: "Open Munich Airport digital map",
    provider: "Munich Airport",
    url: "https://www.munich-airport.com/airport-map-261352",
    kind: "official_interactive",
    official: true,
    supportsCurrentLocation: false,
    supportsStepByStep: false,
    availableOffline: false,
    verifiedAt: "2026-07-13",
  },
  ZRH: {
    iata: "ZRH",
    label: "Open Zurich Airport interactive map",
    provider: "Zurich Airport",
    url: "https://www.flughafen-zuerich.ch/en/passengers/practical/guidance/interactive-map",
    kind: "official_interactive",
    official: true,
    supportsCurrentLocation: false,
    supportsStepByStep: true,
    availableOffline: false,
    verifiedAt: "2026-07-13",
  },
  HNL: {
    iata: "HNL",
    label: "Open official HNL terminal maps",
    provider: "Hawaii Department of Transportation",
    url: "https://airports.hawaii.gov/hnl/airport-map/",
    kind: "official_map",
    official: true,
    supportsCurrentLocation: false,
    supportsStepByStep: false,
    availableOffline: false,
    verifiedAt: "2026-07-13",
  },
  BRI: {
    iata: "BRI",
    label: "Open official Bari terminal maps",
    provider: "Aeroporti di Puglia",
    url: "https://bari.airports.aeroportidipuglia.it/en/mappe-aeroporti/type/mappa-aerostazione/",
    kind: "official_map",
    official: true,
    supportsCurrentLocation: false,
    supportsStepByStep: false,
    availableOffline: false,
    verifiedAt: "2026-07-13",
  },
  VCE: {
    iata: "VCE",
    label: "Open Venice Airport interactive map",
    provider: "Venice Marco Polo Airport",
    url: "https://www.veneziaairport.it/en_gb/at-the-airport/map",
    kind: "official_interactive",
    official: true,
    supportsCurrentLocation: false,
    supportsStepByStep: false,
    availableOffline: false,
    verifiedAt: "2026-07-13",
  },
  LAX: {
    iata: "LAX",
    label: "Open official LAX interactive map",
    provider: "Los Angeles World Airports",
    url: "https://www.flylax.com/lax-terminal-maps",
    kind: "official_interactive",
    official: true,
    supportsCurrentLocation: false,
    supportsStepByStep: false,
    availableOffline: false,
    verifiedAt: "2026-07-13",
  },
  SFO: {
    iata: "SFO",
    label: "Open official SFO step-by-step map",
    provider: "San Francisco International Airport",
    url: "https://www.flysfo.com/maps",
    kind: "official_interactive",
    official: true,
    supportsCurrentLocation: false,
    supportsStepByStep: true,
    availableOffline: false,
    verifiedAt: "2026-07-13",
  },
};

export function getAirportWayfindingResource(
  iata: string | null | undefined,
): AirportWayfindingResource | null {
  const code = iata?.trim().toUpperCase();
  if (!code) return null;
  const verified = VERIFIED_AIRPORT_WAYFINDING[code];
  if (verified) return verified;

  return {
    iata: code,
    label: `Open ${code} airport map`,
    provider: "Google Maps venue search",
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${code} airport terminal map`)}`,
    kind: "universal_map",
    official: false,
    supportsCurrentLocation: true,
    supportsStepByStep: false,
    availableOffline: false,
    verifiedAt: null,
  };
}

export function listVerifiedAirportWayfindingResources(): AirportWayfindingResource[] {
  return Object.values(VERIFIED_AIRPORT_WAYFINDING);
}

/**
 * Honesty tier for how confidently we present an external map link (M12 / M34).
 * - strong: airport-owned, verified step-by-step (e.g. SEA Atrius) — may be a primary CTA
 * - official_static: airport-owned but not step-by-step — secondary reference
 * - weak: Google venue-search fallback — never look as confident as a real indoor map
 */
export type WayfindingHonestyTier = "strong" | "official_static" | "weak";

export function wayfindingHonestyTier(
  resource: AirportWayfindingResource | null | undefined,
): WayfindingHonestyTier {
  if (!resource) return "weak";
  if (resource.official && resource.supportsStepByStep) return "strong";
  if (resource.official) return "official_static";
  return "weak";
}

/** True when this IATA is in the verified registry (not the Google fallback). */
export function hasVerifiedAirportWayfinding(iata: string | null | undefined): boolean {
  const code = iata?.trim().toUpperCase();
  return Boolean(code && VERIFIED_AIRPORT_WAYFINDING[code]);
}

/**
 * M62 — when the traveler is physically on campus and Kepi has a bundled layout,
 * Kepi's live map is primary even for strong official tiers (SEA Atrius / flysea).
 * Plan/preview keeps G48: strong official maps stay primary before arrival.
 */
export function shouldKepiMapBePrimary(opts: {
  tier: WayfindingHonestyTier;
  hasKepiLayout: boolean;
  liveAtAirport: boolean;
}): boolean {
  const { tier, hasKepiLayout, liveAtAirport } = opts;
  if (liveAtAirport && hasKepiLayout) return true;
  if (tier === "strong") return false;
  return hasKepiLayout;
}
