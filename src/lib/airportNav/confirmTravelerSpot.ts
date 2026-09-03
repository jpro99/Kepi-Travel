/**
 * Resolve a traveler "I'm here" map tap to the nearest official graph node.
 * M16 — user-confirmed position outranks indoor GPS. Official nodes only.
 */

import { snapToGraph } from "@/lib/airportNav/pathfinder";
import { listOfficialConfirmNodeIds } from "@/lib/airportNav/imHereGnssPolicy";
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
    layout.pois.find((p) => p.nodeId === nodeId && p.category === "baggage") ??
    layout.pois.find((p) => p.nodeId === nodeId);
  if (poi?.doorLabel) return `Door ${poi.doorLabel}`;
  if (poi?.name?.trim()) return poi.name.trim();
  if (poi?.category === "gate") return "your gate area";
  if (poi?.category === "checkin") return "check-in";
  if (poi?.category === "security") return "security";
  if (poi?.category === "baggage") return "baggage claim";
  const node = layout.nodes.find((n) => n.id === nodeId);
  if (node?.kind === "gate") return "gate area";
  if (node?.kind === "security_entry" || node?.kind === "security_exit") return "security";
  if (node?.kind === "checkin") return "check-in";
  if (node?.kind === "baggage_claim") return "baggage claim";
  if (node?.kind === "door") return "this door";
  if (node?.landmark?.trim()) return node.landmark.trim();
  return "this spot";
}

/** Snap a map tap to the nearest official walk-graph node. */
export function resolveConfirmSpotFromLngLat(
  layout: AirportLayout,
  lng: number,
  lat: number,
): ConfirmedTravelerSpot | null {
  const official = listOfficialConfirmNodeIds(layout);
  const snapped = snapToGraph(layout, lng, lat, 20);
  if (!snapped || !official.has(snapped.nearestNodeId)) return null;
  return {
    nodeId: snapped.nearestNodeId,
    label: labelForNode(layout, snapped.nearestNodeId),
    offGraphMeters: snapped.offGraphMeters,
  };
}
