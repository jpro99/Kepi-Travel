/**
 * BRI KAC ingest entry — adapt compiler JSON, overlay curated layout.
 * Client-safe: fixture is bundled via JSON import (no fs).
 */

import briKacCompilerJson from "../../../../fixtures/kac/bri.json";

import { BRI_LAYOUT } from "../layouts/bri";
import type { AirportLayout } from "../types";
import type { AirportLayoutPackage } from "../airportLayoutPackage";
import { adaptKacCompilerJson } from "./adaptKacCompilerJson";
import { applyBriKacOverlay } from "./applyBriKacOverlay";
import type { KacCompilerPackage } from "./types";

/** Canonical KAC compiler payload (fixtures/kac/bri.json). */
export const BRI_KAC_COMPILER_JSON = briKacCompilerJson as unknown as KacCompilerPackage;

export function ingestBriKacPackage(raw: unknown = BRI_KAC_COMPILER_JSON): AirportLayoutPackage {
  return adaptKacCompilerJson(raw);
}

/**
 * Build BRI layout with KAC draft overlay applied (additive; curated graph preserved).
 */
export function buildBriLayoutWithKacOverlay(
  curated: AirportLayout = BRI_LAYOUT,
  rawKac: unknown = BRI_KAC_COMPILER_JSON,
): AirportLayout {
  const kacPackage = ingestBriKacPackage(rawKac);
  return applyBriKacOverlay(curated, kacPackage.layout).layout;
}
