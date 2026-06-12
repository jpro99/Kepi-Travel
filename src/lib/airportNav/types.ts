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

export type SecurityLaneType = "standard" | "precheck" | "clear" | "clear_precheck" | "priority";

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

/* ─── 3D terminal navigator model (AirportNavigator / layouts/index) ─── */

export type LevelId = string;

export interface Point3D {
  lng: number;
  lat: number;
  level: LevelId;
}

export interface AirportTerminal3DModel {
  iata: string;
  updatedAt: string;
  attribution: string;
  center: { lng: number; lat: number };
  levels: TerminalLevel[];
  graph: WalkwayGraph;
  securityLanes: SecurityLaneDef[];
  pois: POIDefinition[];
}

export interface TerminalLevel {
  id: LevelId;
  name: string;
  ordinal: number;
  airside: "landside" | "airside" | "mixed";
  footprint: GeoJSON.FeatureCollection;
  extrusionHeight?: number;
}

export interface WalkwayGraph {
  nodes: NavGraphNode[];
  edges: NavGraphEdge[];
}

export interface NavGraphNode {
  id: string;
  pos: Point3D;
  kind:
    | "junction"
    | "door"
    | "gate"
    | "lounge"
    | "checkin"
    | "security_entry"
    | "security_exit"
    | "escalator"
    | "elevator"
    | "train_platform"
    | "restroom"
    | "baggage"
    | "customs"
    | "landmark";
  landmark?: string;
  region?: "landside" | "security_queue" | "security" | "airside";
}

export interface NavGraphEdge {
  id: string;
  from: string;
  to: string;
  kind:
    | "walkway"
    | "moving_walkway"
    | "escalator"
    | "elevator"
    | "stairs"
    | "train"
    | "security_transition";
  lengthM: number;
  traverseSeconds: number;
  bidirectional: boolean;
  accessible: boolean;
  laneType?: SecurityLaneType;
}

export interface SecurityLaneDef {
  id: string;
  laneType: SecurityLaneType;
  entryNodeId: string;
  exitNodeId: string;
  estimatedWaitMin?: {
    low: number;
    high: number;
    source: "tsa" | "crowd" | "static";
    asOf: string;
  };
  notes?: string;
}

export interface TravelerCredentials {
  tsaPreCheck: boolean | "unknown";
  clear: boolean | "unknown";
  globalEntry: boolean | "unknown";
  airlineStatus?: { airline: string; tier: string }[];
  paymentCards?: VaultCardRef[];
  loungeMemberships?: (
    | "priority_pass"
    | "admirals_club"
    | "united_club"
    | "sky_club"
    | "amex_centurion"
  )[];
  askedAt?: string;
}

export interface VaultCardRef {
  id: string;
  product: string;
  network: string;
}

export interface POIDefinition {
  id: string;
  nodeId: string;
  category:
    | "gate"
    | "checkin"
    | "security"
    | "lounge"
    | "restroom"
    | "food"
    | "charging"
    | "baggage"
    | "customs"
    | "kiosk"
    | "service";
  name: string;
  airline?: string;
  loungeId?: string;
  gateCode?: string;
}

export interface POIBubble {
  poiId: string;
  state: "primary" | "next" | "passive" | "completed" | "ineligible" | "hidden";
  title: string;
  liveLine?: string;
  urgency: "none" | "soon" | "critical";
  eligibility?: LoungeEligibilityResult;
  tapAction: { type: "navigate" | "detail" | "ask_credentials"; payload?: unknown };
}

export interface NavigationPath {
  id: string;
  fromNodeId: string;
  toPoiId: string;
  profile: "default" | "sprint" | "accessible" | "together";
  segments: PathSegment[];
  totalSeconds: number;
  totalMeters: number;
  computedAt: string;
  validForPhase: NavigatorJourneyPhaseId[];
}

export interface PathSegment {
  id: string;
  edgeIds: string[];
  level: LevelId;
  geometry: GeoJSON.LineString;
  instruction: TurnInstruction;
  progress: "completed" | "active" | "upcoming";
  warmth: number;
}

export interface TurnInstruction {
  text: string;
  spokenText?: string;
  maneuver:
    | "straight"
    | "left"
    | "right"
    | "slight_left"
    | "slight_right"
    | "escalator_up"
    | "escalator_down"
    | "elevator"
    | "train_board"
    | "train_exit"
    | "security"
    | "arrive";
  triggerDistanceM: number;
  landmark?: string;
}

export type NavigatorJourneyPhaseId =
  | "approach"
  | "landside"
  | "checkin"
  | "security_queue"
  | "security"
  | "airside"
  | "lounge"
  | "to_gate"
  | "at_gate"
  | "boarding"
  | "onboard"
  | "deplane"
  | "connection_transit"
  | "customs"
  | "baggage"
  | "ground_transport";

export interface JourneyPhase {
  id: NavigatorJourneyPhaseId;
  enteredAt?: string;
  exitedAt?: string;
  status: "pending" | "active" | "completed" | "skipped";
  confirmedBy?: "geofence" | "graph_region" | "user" | "voice" | "reservation_event";
  objectivePoiId?: string;
}

export interface LoungeEligibilityResult {
  loungeId: string;
  eligible: boolean;
  via?: string;
  reason?: string;
  guestPolicy?: string;
  walkSeconds?: number;
  rankScore?: number;
  lastVerified: string;
}

export interface VoiceNavIntent {
  intent:
    | "navigate_gate"
    | "navigate_poi"
    | "set_credentials"
    | "find_companion"
    | "find_bag"
    | "lounge_query"
    | "next_step"
    | "sprint"
    | "confirm_phase"
    | "cancel"
    | "fallthrough_concierge";
  slots: Record<string, string | boolean>;
  confidence: number;
  source: "local_router" | "claude";
  spokenResponse?: string;
}

export interface CompanionMarker {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  snappedNodeId?: string;
  rawFix?: IndoorPositionFix;
  staleness: "live" | "recent" | "stale";
  reuniteSeconds?: number;
}

export interface BagTrackerMarker {
  trackerId: string;
  label: string;
  protocol: "tile" | "ble_generic" | "findmy_export";
  lastSeenAt: string;
  lastSeenNodeId?: string;
  rssiProximity?: "here" | "near" | "far" | "out_of_range";
  divergenceAlert?: boolean;
}

export interface IndoorPositionFix {
  pos: Point3D;
  accuracyM: number;
  confidence: number;
  source: "os_indoor" | "gps_snap" | "dead_reckoning" | "user_confirmed";
  heading?: number;
  speedMps?: number;
  at: string;
  snappedNodeId?: string;
}

export interface FlightNavContext {
  flightNumber: string;
  airline: string;
  gateCode: string | null;
  terminal?: string;
  boardingCloseIso?: string | null;
  originIata: string;
  destinationIata: string;
}

export interface NavPrompt {
  id: string;
  text: string;
  options: { label: string; action: NavPromptAction }[];
}

export type NavPromptAction =
  | { type: "credentials"; tsaPreCheck: boolean; clear: boolean }
  | { type: "confirm_phase"; phaseId: NavigatorJourneyPhaseId }
  | { type: "navigate"; poiId: string }
  | { type: "dismiss" };

/** @deprecated Alias for the 3D navigator engine — prefer NavigatorJourneyPhaseId in new code. */
export type JourneyPhaseId = NavigatorJourneyPhaseId;
