/**
 * Bundled safety seeds for Kepi-owned airport layouts.
 * Published database packages are resolved by airportLayoutStore; keep only
 * critical offline/bootstrap layouts here.
 */

import type { AirportLayout } from "./types";
import { SEA_LAYOUT } from "./layouts/sea";
import { LAX_LAYOUT } from "./layouts/lax";
import { ONT_LAYOUT } from "./layouts/ont";
import { BRI_LAYOUT } from "./layouts/bri";
import { FCO_LAYOUT } from "./layouts/fco";
import { VCE_LAYOUT } from "./layouts/vce";
import { MUC_LAYOUT } from "./layouts/muc";
import { buildFcoLayoutWithKacOverlay } from "./kac/fcoKacIngest";

/** Curated FCO + KAC draft overlay (OSM rings, unrouted gate dots; first-mile preserved). */
const FCO_LAYOUT_LIVE = buildFcoLayoutWithKacOverlay();

const LAYOUTS: Record<string, AirportLayout> = {
  SEA: SEA_LAYOUT,
  LAX: LAX_LAYOUT,
  ONT: ONT_LAYOUT,
  BRI: BRI_LAYOUT,
  FCO: FCO_LAYOUT_LIVE,
  VCE: VCE_LAYOUT,
  MUC: MUC_LAYOUT,
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

/**
 * Every bundled layout in registry order. Cross-airport law tests must loop this
 * (not hand-copied SEA/LAX/ONT arrays) so a new getLayout entry automatically
 * inherits M29 / M30 / M31 / M32 / M35 coverage.
 */
export function listAllBundledLayouts(): AirportLayout[] {
  return Object.values(LAYOUTS);
}
