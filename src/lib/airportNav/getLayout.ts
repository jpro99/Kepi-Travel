/**
 * Bundled safety seeds for Kepi-owned airport layouts.
 * Published database packages are resolved by airportLayoutStore; keep only
 * critical offline/bootstrap layouts here.
 */

import type { AirportLayout } from "./types";
import { SEA_LAYOUT } from "./layouts/sea";
import { LAX_LAYOUT } from "./layouts/lax";
import { ONT_LAYOUT } from "./layouts/ont";

const LAYOUTS: Record<string, AirportLayout> = {
  SEA: SEA_LAYOUT,
  LAX: LAX_LAYOUT,
  ONT: ONT_LAYOUT,
};

export function getAirportLayout(iata: string | null | undefined): AirportLayout | null {
  if (!iata) return null;
  return LAYOUTS[iata.trim().toUpperCase()] ?? null;
}

export function hasAirportLayout(iata: string | null | undefined): boolean {
  return getAirportLayout(iata) !== null;
}

/** Airports bundled with the app; database-backed coverage may be larger. */
export function listSupportedIndoorAirports(): string[] {
  return Object.keys(LAYOUTS);
}
