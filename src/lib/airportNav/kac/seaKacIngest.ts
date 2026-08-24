/**
 * SEA KAC ingest — adapt compiler JSON, overlay curated layout.
 * Client-safe: fixture bundled via JSON import (no fs).
 */

import seaKacCompilerJson from "../../../../fixtures/kac/sea.json";

import { SEA_LAYOUT } from "../layouts/sea";
import type { AirportLayout } from "../types";
import type { AirportLayoutPackage } from "../airportLayoutPackage";
import { adaptKacCompilerJson } from "./adaptKacCompilerJson";
import { applyKacOverlay } from "./applyKacOverlay";
import { SEA_CURATED_GUARDS } from "./seaConnectionGuards";

export const SEA_KAC_COMPILER_JSON = seaKacCompilerJson;

const SEA_AREA_LOUNGES = [
  "SEA:lounge:alaska-c",
  "SEA:lounge:alaska-d",
  "SEA:lounge:alaska-n",
] as const;

export function ingestSeaKacPackage(raw: unknown = SEA_KAC_COMPILER_JSON): AirportLayoutPackage {
  return adaptKacCompilerJson(raw);
}

export function buildSeaLayoutWithKacOverlay(
  curated: AirportLayout = SEA_LAYOUT,
  rawKac: unknown = SEA_KAC_COMPILER_JSON,
): AirportLayout {
  const kacPackage = ingestSeaKacPackage(rawKac);
  return applyKacOverlay(curated, kacPackage.layout, SEA_CURATED_GUARDS, {
    mergeGateResolver: true,
    unroutedGatePoiIdPrefix: "poi:SEA:node:gate:",
    areaLoungeNodeIds: SEA_AREA_LOUNGES,
  }).layout;
}
