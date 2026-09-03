/**
 * I'm-here GNSS policy (Sunday A3) — outdoor curb only, refuse indoor GNSS.
 * Official nodes / last outdoor curb; no BLE / Wi-Fi / indoor positioning.
 */

import { booleanPointInPolygon, point, polygon } from "@turf/turf";
import { metersBetween } from "@/lib/airportNav/directionArrow";
import { extractLandsideOverlayGeometry, isCurbOverlayNode } from "@/lib/airportNav/landsideOverlay";
import type { AirportLayout, GraphNode } from "@/lib/airportNav/types";

/** Fixes older than ~10s are stale for I'm-here / live dot. */
export const IM_HERE_MAX_STALE_MS = 10_000;
/** Outside hull: require horizontalAccuracy ≤ 20m (15–20m band). */
export const IM_HERE_MAX_ACCURACY_OUTSIDE_M = 20;
/** Inside hull: refuse at ≥ 30m accuracy. */
export const IM_HERE_REFUSE_ACCURACY_INSIDE_M = 30;

export type ImHereGnssRefusalReason =
  | "stale"
  | "inside_hull"
  | "indoor_gnss"
  | "accuracy_swallows_hull"
  | "accuracy_too_low";

export type ImHereGnssEvaluation =
  | { accepted: true; outsideHull: true }
  | { accepted: false; reason: ImHereGnssRefusalReason };

export function terminalHullRings(layout: AirportLayout): [number, number][][] {
  const { terminalHulls } = extractLandsideOverlayGeometry(layout);
  if (terminalHulls.length > 0) return terminalHulls.map((zone) => zone.ring);
  return layout.zones.filter((z) => !z.airside).map((z) => z.ring);
}

export function isInsideTerminalHull(
  lng: number,
  lat: number,
  hullRings: ReadonlyArray<ReadonlyArray<[number, number]>>,
): boolean {
  const pt = point([lng, lat]);
  for (const ring of hullRings) {
    if (ring.length < 3) continue;
    try {
      if (booleanPointInPolygon(pt, polygon([ring]))) return true;
    } catch {
      /* invalid ring — skip */
    }
  }
  return false;
}

function accuracyCircleSwallowsHull(
  lng: number,
  lat: number,
  accuracyM: number,
  hullRings: ReadonlyArray<ReadonlyArray<[number, number]>>,
): boolean {
  if (!Number.isFinite(accuracyM) || accuracyM <= 0) return false;
  const center: [number, number] = [lng, lat];
  for (const ring of hullRings) {
    for (const coord of ring) {
      if (metersBetween(center, coord) <= accuracyM) return true;
    }
  }
  return false;
}

/** Sunday A3 — dot only outside OSM terminal hull with fresh, tight GNSS. */
export function evaluateImHereGnssFix(input: {
  lng: number;
  lat: number;
  accuracyM: number | null | undefined;
  fixAgeMs: number;
  hullRings: ReadonlyArray<ReadonlyArray<[number, number]>>;
}): ImHereGnssEvaluation {
  if (input.fixAgeMs > IM_HERE_MAX_STALE_MS) {
    return { accepted: false, reason: "stale" };
  }
  const accuracyM =
    typeof input.accuracyM === "number" && Number.isFinite(input.accuracyM)
      ? input.accuracyM
      : Number.POSITIVE_INFINITY;
  const insideHull = isInsideTerminalHull(input.lng, input.lat, input.hullRings);

  if (insideHull) {
    if (accuracyM >= IM_HERE_REFUSE_ACCURACY_INSIDE_M) {
      return { accepted: false, reason: "indoor_gnss" };
    }
    if (accuracyCircleSwallowsHull(input.lng, input.lat, accuracyM, input.hullRings)) {
      return { accepted: false, reason: "accuracy_swallows_hull" };
    }
    return { accepted: false, reason: "inside_hull" };
  }

  if (accuracyM > IM_HERE_MAX_ACCURACY_OUTSIDE_M) {
    return { accepted: false, reason: "accuracy_too_low" };
  }

  return { accepted: true, outsideHull: true };
}

/** Last outdoor curb node — official `:node:curb` anchors only. */
export function resolveLastOutdoorCurbNode(
  layout: AirportLayout,
  lng: number,
  lat: number,
): GraphNode | null {
  const curbNodes = layout.nodes.filter(isCurbOverlayNode);
  if (curbNodes.length === 0) return null;
  let best: GraphNode | null = null;
  let bestDist = Infinity;
  for (const node of curbNodes) {
    const d = metersBetween([lng, lat], node.pos);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  return bestDist <= 120 ? best : null;
}

/** Official confirm targets — layout POIs and surveyed curb nodes only. */
export function listOfficialConfirmNodeIds(layout: AirportLayout): Set<string> {
  const ids = new Set<string>();
  for (const poi of layout.pois) ids.add(poi.nodeId);
  for (const node of layout.nodes) {
    if (isCurbOverlayNode(node)) ids.add(node.id);
  }
  return ids;
}
