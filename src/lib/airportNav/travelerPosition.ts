/**
 * Honest traveler position on the airport map (M16 extension).
 *
 * On the apron / runway, indoor graph snap lands on the nearest gate or
 * building — misleading for orientation. Raw GPS drives the map puck; graph
 * snap is used for routing only when close enough to trust.
 */

import type { SnappedPosition } from "./types";

/** Beyond this distance from the walk graph, node snap is not honest (runway, apron). */
export const UNTRUSTWORTHY_OFF_GRAPH_METERS = 45;

export function isTrustworthyGraphSnap(
  snapped: SnappedPosition | null | undefined,
  accuracyM?: number | null,
): boolean {
  if (!snapped) return false;
  if (snapped.offGraphMeters > UNTRUSTWORTHY_OFF_GRAPH_METERS) return false;
  if (snapped.offGraphMeters > 25 && accuracyM != null && Number.isFinite(accuracyM) && accuracyM > 60) {
    return false;
  }
  if (snapped.confidence < 0.45) return false;
  return true;
}

/** Map puck — raw GPS unless the traveler confirmed a graph node ("I'm here"). */
export function resolveTravelerDisplayPosition(input: {
  userLon: number | null;
  userLat: number | null;
  snapped: SnappedPosition | null;
  confirmedNodeId: string | null;
}): [number, number] | null {
  if (input.confirmedNodeId && input.snapped) return input.snapped.pos;
  if (input.userLon != null && input.userLat != null) return [input.userLon, input.userLat];
  return input.snapped?.pos ?? null;
}

/** Walk-graph origin for routing — never a schematic gate guess on the airfield. */
export function resolveRoutingOriginNodeId(input: {
  previewMode: boolean;
  confirmedNodeId: string | null;
  snapped: SnappedPosition | null;
  accuracyM?: number | null;
  schematicFallbackNodeId?: string | null;
}): string | null {
  if (input.previewMode) return input.schematicFallbackNodeId ?? null;
  if (input.confirmedNodeId) return input.confirmedNodeId;
  if (isTrustworthyGraphSnap(input.snapped, input.accuracyM)) {
    return input.snapped!.nearestNodeId;
  }
  return null;
}

export function hasTrustworthyLiveGraphPosition(input: {
  previewMode: boolean;
  confirmedNodeId: string | null;
  snapped: SnappedPosition | null;
  accuracyM?: number | null;
}): boolean {
  if (input.previewMode) return false;
  if (input.confirmedNodeId) return true;
  return isTrustworthyGraphSnap(input.snapped, input.accuracyM);
}

export function isOffGraphGpsDisplay(input: {
  previewMode: boolean;
  confirmedNodeId: string | null;
  userLon: number | null;
  userLat: number | null;
  snapped: SnappedPosition | null;
  accuracyM?: number | null;
}): boolean {
  if (input.previewMode || input.confirmedNodeId) return false;
  if (input.userLon == null || input.userLat == null) return false;
  if (!input.snapped) return false;
  return !isTrustworthyGraphSnap(input.snapped, input.accuracyM);
}

export const OFF_GRAPH_GPS_BANNER =
  "Showing your GPS on the airfield — use the map to orient. Directions start inside the terminal (tap I'm here when you're there).";
