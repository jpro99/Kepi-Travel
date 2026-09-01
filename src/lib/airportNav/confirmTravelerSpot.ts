/**
 * Resolve a traveler "I'm here" map tap to the nearest graph node.
 * M16 — user-confirmed position outranks indoor GPS.
 */

import { snapToGraph } from "@/lib/airportNav/pathfinder";
import type { AirportLayout } from "@/lib/airportNav/types";

export interface ConfirmedTravelerSpot {
  nodeId: string;
  label: string;
  offGraphMeters: number;
}

function labelForNode(layout: AirportLayout, nodeId: string): string {
  const poi =
    layout.pois.find((p) => p.nodeId === nodeId && p.category === "checkin") ??
    layout.pois.find((p) => p.nodeId === nodeId && p.category === "gate") ??
    layout.pois.find((p) => p.nodeId === nodeId && p.category === "security") ??
    layout.pois.find((p) => p.nodeId === nodeId);
  if (poi?.doorLabel) return `Door ${poi.doorLabel}`;
  if (poi?.name?.trim()) return poi.name.trim();
  if (poi?.category === "gate") return "your gate area";
  if (poi?.category === "checkin") return "check-in";
  if (poi?.category === "security") return "security";
  const node = layout.nodes.find((n) => n.id === nodeId);
  if (node?.kind === "gate") return "gate area";
  if (node?.kind === "security_entry" || node?.kind === "security_exit") return "security";
  if (node?.kind === "checkin") return "check-in";
  if (node?.kind === "door") return "this door";
  return "this spot";
}

/** Snap a map tap to the nearest walk-graph node (rejects taps far outside the terminal). */
export function resolveConfirmSpotFromLngLat(
  layout: AirportLayout,
  lng: number,
  lat: number,
): ConfirmedTravelerSpot | null {
  const snapped = snapToGraph(layout, lng, lat, 20);
  if (!snapped) return null;
  return {
    nodeId: snapped.nearestNodeId,
    label: labelForNode(layout, snapped.nearestNodeId),
    offGraphMeters: snapped.offGraphMeters,
  };
}
