/**
 * Bundled safety seeds for Kepi-owned airport layouts.
 * Published database packages are resolved by airportLayoutStore; keep only
 * critical offline/bootstrap layouts here.
 */

import type { AirportLayout } from "./types";
import { LAX_LAYOUT } from "./layouts/lax";
import { BRI_LAYOUT } from "./layouts/bri";
import { VCE_LAYOUT } from "./layouts/vce";
import { MUC_LAYOUT } from "./layouts/muc";
import { buildFcoLayoutWithKacOverlay } from "./kac/fcoKacIngest";
import { buildOntLayoutWithKacOverlay } from "./kac/ontKacIngest";
import { buildSeaLayoutWithKacOverlay } from "./kac/seaKacIngest";

/** Curated FCO + KAC draft overlay (OSM rings, unrouted gate dots; first-mile preserved). */
const FCO_LAYOUT_LIVE = buildFcoLayoutWithKacOverlay();

/** Curated ONT + KAC draft overlay (OSM gate dots, Aspire AREA lounges; first-mile preserved). */
const ONT_LAYOUT_LIVE = buildOntLayoutWithKacOverlay();

/** Curated SEA + KAC draft overlay (OSM gate dots, Alaska AREA lounges; connection graph preserved). */
const SEA_LAYOUT_LIVE = buildSeaLayoutWithKacOverlay();

const LAYOUTS: Record<string, AirportLayout> = {
  SEA: SEA_LAYOUT_LIVE,
  LAX: LAX_LAYOUT,
  ONT: ONT_LAYOUT_LIVE,
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
