/**
 * Walk-map pin policy — trip wayfinding only, not a mall directory (M43 / CEO 2026-08-27).
 *
 * ONT basemap model: tiny dots at real coords; human names ONLY outside the hull
 * on leader-line callouts for this trip's walk stops (and the one tapped POI).
 * No Starbucks directory. No 100+ grey gate reference dots.
 */

import type { PoiCategory, PoiDefinition } from "./types";

export interface WalkMapPinContext {
  isSelected: boolean;
  isGateBubble: boolean;
  isJourney: boolean;
  isObjective: boolean;
  matchesAirline: boolean;
  isCurbDropoff: boolean;
  isReference: boolean;
  isSecurity: boolean;
}

const WALK_REFERENCE_CATEGORIES = new Set<PoiCategory>([
  "gate",
  "checkin",
  "security",
  "lounge",
  "baggage",
  "customs",
  "train",
  "ground_transport",
]);

/** KAC/OSM gate door-ref pins downgraded to amenity — not routable walk stops. */
export function isUnroutedGateReferencePoi(poi: PoiDefinition): boolean {
  if (poi.category !== "amenity") return false;
  return /:(poi|node):gate:/i.test(poi.id) || /:node:gate:/i.test(poi.nodeId);
}

/** Shop/food/bank directory POIs — keep in OSM data files, never on the walk map. */
export function isDirectoryClutterPoi(poi: PoiDefinition): boolean {
  if (poi.category === "restroom") return true;
  if (poi.category !== "amenity") return false;
  if (poi.id.startsWith("poi-amenity-")) return true;
  if (isUnroutedGateReferencePoi(poi)) return false;
  if (/:(poi|node):(checkin|security):/i.test(poi.id)) return false;
  if (poi.notes?.includes("AREA pin") || poi.notes?.includes("unrouted reference")) return false;
  return true;
}

function isEmphaticWalkStop(ctx: WalkMapPinContext): boolean {
  return (
    ctx.isSelected
    || ctx.isGateBubble
    || ctx.isJourney
    || ctx.isObjective
    || ctx.matchesAirline
    || ctx.isCurbDropoff
  );
}

/**
 * True when this POI may render as a map pin.
 * Walk references only — no mall directory, no 100+ gate reference dots.
 */
export function shouldRenderWalkMapPin(poi: PoiDefinition, ctx: WalkMapPinContext): boolean {
  if (isDirectoryClutterPoi(poi)) return false;

  if (isUnroutedGateReferencePoi(poi)) {
    return ctx.isSelected || ctx.isGateBubble;
  }

  if (poi.category === "checkin") {
    if (poi.airline) {
      return ctx.isSelected || ctx.isJourney || ctx.matchesAirline;
    }
    return isEmphaticWalkStop(ctx);
  }

  if (poi.category === "lounge") {
    return ctx.isSelected || ctx.isJourney || ctx.isObjective;
  }

  if (poi.category === "gate") {
    return ctx.isSelected || ctx.isGateBubble || ctx.isJourney;
  }

  if (WALK_REFERENCE_CATEGORIES.has(poi.category)) {
    return isEmphaticWalkStop(ctx);
  }

  return false;
}

/** Leader-line callout — emphatic walk stops + explicit selection only. */
export function shouldShowLeaderLineLabel(poi: PoiDefinition, ctx: WalkMapPinContext): boolean {
  if (!shouldRenderWalkMapPin(poi, ctx)) return false;
  if (!isEmphaticWalkStop(ctx)) return false;
  if (ctx.isReference && !ctx.isSelected) return false;
  return true;
}

/** Higher wins collision resolution. */
export function walkMapLabelPriority(ctx: WalkMapPinContext, journeyIndex = 99): number {
  if (ctx.isSelected) return 100;
  if (ctx.isGateBubble) return 95;
  if (ctx.isJourney) return 90 - Math.min(journeyIndex, 40);
  if (ctx.isCurbDropoff) return 70;
  if (ctx.matchesAirline) return 65;
  if (ctx.isObjective) return 60;
  return 50;
}

/** Where-to / Essentials list — same walk scope as pins (no gate directory). */
export function shouldListInWhereTo(poi: PoiDefinition, ctx: WalkMapPinContext): boolean {
  return shouldRenderWalkMapPin(poi, ctx);
}
