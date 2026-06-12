/**
 * Kepi Airport Navigator — core data model (Phase 0).
 * Spec: docs/AIRPORT_NAVIGATOR_SPEC.md
 *
 * A curated terminal layout = footprint polygons (rendered as 3D extrusions)
 * + a walkway graph (nodes/edges) used for routing + POIs anchored to nodes.
 * Coordinates are real lng/lat so GPS can snap onto the graph, but layouts
 * are schematic-grade in v1 ("Layout beta") — accuracy comes from snapping,
 * never from pretending GPS is indoor-precise.
 */

export type SecurityLaneType = "standard" | "precheck" | "clear" | "priority";

export type GraphNodeKind =
  | "junction"
  | "door"
  | "gate"
  | "lounge"
  | "checkin"
  | "security_entry"
  | "security_exit"
  | "train_platform"
  | "restroom"
  | "landmark";

export interface GraphNode {
  id: string;
  /** [lng, lat] */
  pos: [number, number];
  kind: GraphNodeKind;
  /** True when this node is past security. Drives journey phase detection. */
  airside: boolean;
  /** Human landmark used in spoken/written instructions. */
  landmark?: string;
}

export type GraphEdgeKind =
  | "walkway"
  | "moving_walkway"
  | "escalator"
  | "train"
  | "security_transition";

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
  lengthM: number;
  /** Calibrated traversal time (train headways included). */
  traverseSeconds: number;
  bidirectional: boolean;
  /** Only on security_transition edges — which credential unlocks it. */
  laneType?: SecurityLaneType;
}

export interface TerminalZonePolygon {
  id: string;
  name: string;
  /** Closed ring of [lng, lat] coordinates. */
  ring: [number, number][];
  airside: boolean;
  /** Extrusion height in meters for the schematic 3D render. */
  heightM: number;
}

export type PoiCategory =
  | "gate"
  | "checkin"
  | "security"
  | "lounge"
  | "restroom"
  | "train"
  | "baggage";

export interface PoiDefinition {
  id: string;
  nodeId: string;
  category: PoiCategory;
  name: string;
  /** Airline filter, e.g. show "Alaska check-in" only for AS flights. */
  airline?: string;
  /** For security POIs: which lanes exist at this checkpoint. */
  lanes?: SecurityLaneType[];
  notes?: string;
}

export interface AirportLayout {
  iata: string;
  name: string;
  /** Schematic-grade curation version — surfaced in UI as "Layout beta". */
  layoutVersion: string;
  updatedAt: string;
  center: [number, number];
  zones: TerminalZonePolygon[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  pois: PoiDefinition[];
  /** Map a gate code like "C11" to its graph node id, with prefix fallback. */
  gateNodeResolver: { prefix: string; nodeId: string }[];
}

export interface TravelerSecurityCredentials {
  tsaPreCheck: boolean;
  clear: boolean;
  /** True once the traveler has answered (we ask once). */
  known: boolean;
}

export interface RouteInstruction {
  text: string;
  maneuver:
    | "straight"
    | "left"
    | "right"
    | "security"
    | "train_board"
    | "train_exit"
    | "arrive";
  /** Meters from segment start at which this instruction applies. */
  atMeters: number;
  landmark?: string;
}

export interface ComputedRoute {
  fromNodeId: string;
  toPoiId: string;
  nodeIds: string[];
  /** Full polyline of [lng, lat] points, in order. */
  coordinates: [number, number][];
  totalMeters: number;
  totalSeconds: number;
  instructions: RouteInstruction[];
  /** Which security lane the route uses, if it crosses security. */
  laneUsed?: SecurityLaneType;
}

export interface SnappedPosition {
  /** [lng, lat] snapped onto the walkway graph. */
  pos: [number, number];
  nearestNodeId: string;
  /** Raw GPS distance to the graph, meters. */
  offGraphMeters: number;
  /** 0–1: degrades as GPS strays from the graph. */
  confidence: number;
}
