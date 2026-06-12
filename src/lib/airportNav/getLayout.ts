/**
 * Registry of curated airport layouts. Phase 0: SEA only.
 * Add airports here as curation completes (ATL, DEN, ORD, LAX next — spec §H).
 */

import type { AirportLayout } from "./types";
import { SEA_LAYOUT } from "./layouts/sea";

const LAYOUTS: Record<string, AirportLayout> = {
  SEA: SEA_LAYOUT,
};

export function getAirportLayout(iata: string | null | undefined): AirportLayout | null {
  if (!iata) return null;
  return LAYOUTS[iata.trim().toUpperCase()] ?? null;
}

export function hasAirportLayout(iata: string | null | undefined): boolean {
  return getAirportLayout(iata) !== null;
}
