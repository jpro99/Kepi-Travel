/**
 * FCO KAC ingest entry — adapt compiler JSON, overlay curated layout.
 * Client-safe: fixture is bundled via JSON import (no fs).
 */

import fcoKacCompilerJson from "../../../../fixtures/kac/fco.json";

import { FCO_LAYOUT } from "../layouts/fco";
import type { AirportLayout } from "../types";
import type { AirportLayoutPackage } from "../airportLayoutPackage";
import { adaptKacCompilerJson } from "./adaptKacCompilerJson";
import { applyFcoKacOverlay } from "./applyFcoKacOverlay";

/** Canonical KAC compiler payload (fixtures/kac/fco.json). */
export const FCO_KAC_COMPILER_JSON = fcoKacCompilerJson;

export function ingestFcoKacPackage(raw: unknown = FCO_KAC_COMPILER_JSON): AirportLayoutPackage {
  return adaptKacCompilerJson(raw);
}

/**
 * Build FCO layout with KAC draft overlay applied (additive; first-mile preserved).
 */
export function buildFcoLayoutWithKacOverlay(
  curated: AirportLayout = FCO_LAYOUT,
  rawKac: unknown = FCO_KAC_COMPILER_JSON,
): AirportLayout {
  const kacPackage = ingestFcoKacPackage(rawKac);
  return applyFcoKacOverlay(curated, kacPackage.layout).layout;
}
