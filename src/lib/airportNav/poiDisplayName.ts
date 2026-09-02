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

function parseSeaCompilerIdLabel(node: GraphNode): string | null {
  const hub = node.id.match(/:hub:([A-Z])$/i);
  if (hub) return `Concourse ${hub[1]!.toUpperCase()} cluster`;
  const train = node.id.match(/:train:([A-Z])$/i);
  if (train) return `${train[1]!.toUpperCase()} station — SEA Underground`;
  if (/:node:curb:central/i.test(node.id)) return "Departures curb";
  if (/:node:bag:domestic/i.test(node.id)) return "Domestic baggage claim";
  if (/:node:iaf:customs/i.test(node.id)) return "International arrivals — passport";
  if (/:node:iaf:exit/i.test(node.id)) return "IAF meeting point / exit";
  if (/:node:iaf:hall/i.test(node.id)) return "International arrivals hall";
  if (/:node:iaf:sterile/i.test(node.id)) return "International arrivals corridor";
  return null;
}

/** Human label for a graph node (route instructions, landmarks). */
export function resolveNodeDisplayName(node: GraphNode | undefined | null): string | null {
  if (!node) return null;
  const landmark = node.landmark?.trim();
  if (landmark && !isRawGraphLabel(landmark)) return landmark;
  const gate = parseGateLabel(node);
  if (gate) return gate;
  const compiler = parseSeaCompilerIdLabel(node);
  if (compiler) return compiler;
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
  const desk = poi.doorLabel?.trim();
  if (poi.category === "checkin" && desk) {
    const base =
      name && !isRawGraphLabel(name) && !/^check-in desk \d+$/i.test(name)
        ? name
        : "Check-in";
    return `${base} · Desk ${desk}`;
  }
  if (name && !isRawGraphLabel(name)) return name;

  const node = layout?.nodes.find((entry) => entry.id === poi.nodeId);
  const fromNode = resolveNodeDisplayName(node);
  if (fromNode) return fromNode;

  const gate = node ? parseGateLabel(node) : null;
  if (gate) return gate;

  const fromId = parseSeaCompilerIdLabel({
    id: poi.nodeId,
    pos: [0, 0],
    kind: "junction",
    airside: false,
  });
  if (fromId) return fromId;

  const fromRole = roleFallbackFromCategory(poi.category, poi.id);
  if (fromRole) return fromRole;

  return "Destination";
}

/**
 * Belt-and-suspenders: fix POI names + node landmarks on any layout payload
 * (bundled, Redis-published, or IndexedDB-cached) before traveler UI renders.
 */
export function normalizeTravelerFacingLabels(layout: AirportLayout): AirportLayout {
  const nodes = layout.nodes.map((node) => {
    const landmark = node.landmark?.trim();
    if (landmark && !isRawGraphLabel(landmark)) return node;
    const resolved = resolveNodeDisplayName(node);
    return resolved ? { ...node, landmark: resolved } : node;
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const pois = layout.pois.map((poi) => ({
    ...poi,
    name: resolvePoiDisplayName(poi, { nodes }),
  }));

  return { ...layout, nodes, pois };
}
