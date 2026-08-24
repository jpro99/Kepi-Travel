/**
 * ONT KAC ingest — adapt compiler JSON, overlay curated layout.
 * Client-safe: fixture bundled via JSON import (no fs).
 */

import ontKacCompilerJson from "../../../../fixtures/kac/ont.json";

import { ONT_LAYOUT } from "../layouts/ont";
import type { AirportLayout } from "../types";
import type { AirportLayoutPackage } from "../airportLayoutPackage";
import { adaptKacCompilerJson } from "./adaptKacCompilerJson";
import { applyKacOverlay } from "./applyKacOverlay";
import { ONT_CURATED_GUARDS } from "./ontFirstMileGuards";

export const ONT_KAC_COMPILER_JSON = ontKacCompilerJson;

const ONT_AREA_LOUNGES = ["ONT:lounge:aspire-t2", "ONT:lounge:aspire-t4"] as const;

export function ingestOntKacPackage(raw: unknown = ONT_KAC_COMPILER_JSON): AirportLayoutPackage {
  return adaptKacCompilerJson(raw);
}

export function buildOntLayoutWithKacOverlay(
  curated: AirportLayout = ONT_LAYOUT,
  rawKac: unknown = ONT_KAC_COMPILER_JSON,
): AirportLayout {
  const kacPackage = ingestOntKacPackage(rawKac);
  return applyKacOverlay(curated, kacPackage.layout, ONT_CURATED_GUARDS, {
    mergeGateResolver: true,
    unroutedGatePoiIdPrefix: "poi:ONT:node:gate:",
    areaLoungeNodeIds: ONT_AREA_LOUNGES,
  }).layout;
}
