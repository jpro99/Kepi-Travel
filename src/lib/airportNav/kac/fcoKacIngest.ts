/**
 * FCO KAC ingest entry — load compiler JSON, adapt, overlay curated layout.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FCO_LAYOUT } from "../layouts/fco";
import type { AirportLayout } from "../types";
import type { AirportLayoutPackage } from "../airportLayoutPackage";
import { adaptKacCompilerJson } from "./adaptKacCompilerJson";
import { applyFcoKacOverlay } from "./applyFcoKacOverlay";

const DEFAULT_FIXTURE_PATH = join(process.cwd(), "fixtures/kac/fco.json");

export function loadFcoKacCompilerJson(fixturePath = DEFAULT_FIXTURE_PATH): unknown {
  const raw = readFileSync(fixturePath, "utf8");
  return JSON.parse(raw) as unknown;
}

export function ingestFcoKacPackage(raw?: unknown): AirportLayoutPackage {
  const compilerJson = raw ?? loadFcoKacCompilerJson();
  return adaptKacCompilerJson(compilerJson);
}

/**
 * Build FCO layout with KAC draft overlay applied (additive; first-mile preserved).
 */
export function buildFcoLayoutWithKacOverlay(
  curated: AirportLayout = FCO_LAYOUT,
  rawKac?: unknown,
): AirportLayout {
  const kacPackage = ingestFcoKacPackage(rawKac);
  return applyFcoKacOverlay(curated, kacPackage.layout).layout;
}
