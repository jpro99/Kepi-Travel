/**
 * Walk-map pin policy — trip wayfinding only, not a mall directory (M22 / Walker 2026-08-27).
 *
 * ONT basemap model: walk-relevant pins as dots; leader-line labels outside the hull
 * only for emphatic/selected stops. Shop/food OSM directory POIs never render.
 */

import type { PoiDefinition } from "./types";

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

/** Shop/food/bank directory POIs — keep in OSM data files, never on the walk map. */
export function isDirectoryClutterPoi(poi: PoiDefinition): boolean {
  if (poi.category === "restroom") return true;
  if (poi.category !== "amenity") return false;
  // SEA ticketing-hall OSM shop/food pins (removed from layout; guard cached packages).
  if (poi.id.startsWith("poi-amenity-")) return true;
  // KAC unrouted reference pins (gates, check-in zones, security zones) are walk context.
  if (/:(poi|node):gate:/i.test(poi.id) || /:node:gate:/i.test(poi.nodeId)) return false;
  if (/:(poi|node):(checkin|security):/i.test(poi.id)) return false;
  if (poi.notes?.includes("AREA pin") || poi.notes?.includes("unrouted reference")) return false;
  return true;
}

/** True when this POI may render as a map pin at all. */
export function shouldRenderWalkMapPin(poi: PoiDefinition): boolean {
  return !isDirectoryClutterPoi(poi);
}

/**
 * Leader-line callout — emphatic walk stops + selection only; reference gates stay dot-only.
 */
export function shouldShowLeaderLineLabel(poi: PoiDefinition, ctx: WalkMapPinContext): boolean {
  if (isDirectoryClutterPoi(poi)) return false;
  if (ctx.isSelected) return true;
  if (ctx.isReference) return false;
  if (ctx.isGateBubble || ctx.isObjective || ctx.isJourney || ctx.matchesAirline || ctx.isCurbDropoff) {
    return true;
  }
  if (ctx.isSecurity) return true;
  return false;
}
