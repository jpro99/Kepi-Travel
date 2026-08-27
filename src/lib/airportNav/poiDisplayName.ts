/**
 * Traveler-facing labels for airport POIs and graph nodes.
 *
 * Internal ids (SEA:node:*, bag:*, iaf:*, poi:SEA:node:*) must never render on
 * chips, pins, or the Where to picker — human names only (M35 / Walker 2026-08-27).
 */

import type { AirportLayout, GraphNode, PoiCategory, PoiDefinition } from "./types";

/** True when a string looks like an internal graph / compiler id, not a human label. */
export function isRawGraphLabel(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^(poi:)?[A-Z]{3}:node:/i.test(trimmed)) return true;
  if (/^(poi:)?[A-Z]{3}:poi:/i.test(trimmed)) return true;
  if (/^(bag|iaf|gt):[a-z0-9_-]+$/i.test(trimmed)) return true;
  if (/^poi:[a-z0-9_-]+$/i.test(trimmed) && !/\s/.test(trimmed)) return true;
  if (/^gate-[a-z0-9]+$/i.test(trimmed)) return true;
  if (/^curb-[a-z0-9]+$/i.test(trimmed)) return true;
  if (/^checkin-[a-z0-9]+$/i.test(trimmed)) return true;
  if (/^passport-[a-z0-9]+$/i.test(trimmed)) return true;
  if (/^baggage-[a-z0-9]+$/i.test(trimmed)) return true;
  if (/^customs-[a-z0-9]+$/i.test(trimmed)) return true;
  if (/^ground-[a-z0-9-]+$/i.test(trimmed)) return true;
  return false;
}

function roleFallbackFromNode(node: GraphNode): string | null {
  switch (node.kind) {
    case "baggage_claim":
      return /iaf/i.test(node.id) ? "International baggage" : "Baggage claim";
    case "customs":
      return /passport|iaf/i.test(node.id) ? "Passport control" : "Customs";
    case "checkin":
      return "Check-in";
    case "security_entry":
      return "Security";
    case "security_exit":
      return "Past security";
    case "ground_transport":
    case "train_platform":
      return /leonardo/i.test(node.landmark ?? node.id)
        ? "Leonardo Express"
        : /termini/i.test(node.landmark ?? node.id)
          ? "Roma Termini"
          : "Ground transport";
    case "gate":
      return null;
    case "door":
      return "Exit";
    case "junction":
      if (/:node:curb:/i.test(node.id) || /^curb-/.test(node.id)) return "Central curb";
      if (/iaf:hall/i.test(node.id)) return "Arrivals hall";
      if (/iaf:sterile/i.test(node.id)) return "Arrivals corridor";
      return null;
    default:
      return null;
  }
}

function roleFallbackFromCategory(category: PoiCategory, poiId: string): string | null {
  switch (category) {
    case "baggage":
      return /iaf/i.test(poiId) ? "International baggage" : "Domestic baggage";
    case "customs":
      return /passport|iaf/i.test(poiId) ? "Passport control" : "Customs";
    case "checkin":
      return "Check-in";
    case "security":
      return "Security";
    case "train":
      return /termini/i.test(poiId) ? "Roma Termini" : "Train";
    case "ground_transport":
      return /leonardo/i.test(poiId) ? "Leonardo Express" : "Ground transport";
    case "gate":
      return null;
    case "lounge":
      return "Lounge";
    case "amenity":
      return null;
    default:
      return null;
  }
}

function parseGateLabel(node: GraphNode): string | null {
  const gateMatch = node.id.match(/:gate:([A-Z0-9]+)$/i) ?? node.id.match(/^gate-([a-z0-9]+)$/i);
  if (gateMatch) return `Gate ${gateMatch[1]!.toUpperCase()}`;
  const landmarkGate = node.landmark?.match(/^Gate\s+(.+)$/i);
  if (landmarkGate) return `Gate ${landmarkGate[1]!.trim()}`;
  return null;
}

/** Human label for a graph node (route instructions, landmarks). */
export function resolveNodeDisplayName(node: GraphNode | undefined | null): string | null {
  if (!node) return null;
  const landmark = node.landmark?.trim();
  if (landmark && !isRawGraphLabel(landmark)) return landmark;
  const gate = parseGateLabel(node);
  if (gate) return gate;
  return roleFallbackFromNode(node);
}

/**
 * Human label for a POI — used on chips, pins, Where to, and route sheet headers.
 * Never returns a raw internal id; returns null when no honest label exists.
 */
export function resolvePoiDisplayName(
  poi: PoiDefinition,
  layout?: Pick<AirportLayout, "nodes"> | null,
): string {
  const name = poi.name?.trim();
  if (name && !isRawGraphLabel(name)) return name;

  const node = layout?.nodes.find((entry) => entry.id === poi.nodeId);
  const fromNode = resolveNodeDisplayName(node);
  if (fromNode) return fromNode;

  const gate = node ? parseGateLabel(node) : null;
  if (gate) return gate;

  const fromRole = roleFallbackFromCategory(poi.category, poi.id);
  if (fromRole) return fromRole;

  return "Destination";
}
