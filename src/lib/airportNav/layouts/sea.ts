/**
 * SEA (Seattle–Tacoma) curated layout — pilot airport.
 *
 * GEOMETRY (2026-07-13): terminal + satellite *footprints* and node anchors are
 * now the airport's REAL shape, extracted from OpenStreetMap (see
 * ./seaFootprints.ts, `Map data © OpenStreetMap contributors`, ODbL). SEA is
 * one main terminal (concourses A–D radiate inside it) plus the North and South
 * satellites reached by underground train — not eight separate boxes.
 *
 * ROUTING (Phase 2 / M37): OSM pedestrian ways (`highway=footway|corridor|path|
 * steps`) are overlaid via `applyFootwayOverlay` + `seaPedestrianWays.json`
 * (Overpass 2026-07-15). Curated pier/hall walkway bridges remain where OSM is
 * not a continuous sterile-area graph; security_transition + train edges stay
 * curated (M15/M31). `routeGrade:"surveyed"` only when the overlay clears the
 * journey-reachability gate.
 *
 * Graph timings are seeded from src/lib/travelAssistant/airportNavigation.ts:
 *   - security → C gates: ~3 min walk straight ahead
 *   - security → N satellite: walk 2 min + train 4 min + walk 2 min
 *   - N train boards near Gate C18 ("red 'N Gates' sign")
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition, TerminalZonePolygon } from "../types";
import { SEA_OSM_FOOTPRINTS } from "./seaFootprints";
import { buildSeaTicketingHall } from "./seaTicketingHall";
import { applyFootwayOverlay } from "../applyFootwayOverlay";
import type { OsmWayLike } from "../footwayGraph";
import seaPedestrianWays from "./seaPedestrianWays.json";

// Landside node ids — everything else in this layout is past security.
// (security_entry sits landside; security_exit sits airside.)
const LANDSIDE_NODE_IDS = new Set([
  "curb-departures", "checkin-south", "checkin-center", "checkin-north", "landside-hall",
  "sec3-entry", "sec5-entry",
]);

function n(
  id: string,
  lng: number,
  lat: number,
  kind: GraphNode["kind"],
  landmark?: string,
): GraphNode {
  return { id, pos: [lng, lat], kind, airside: !LANDSIDE_NODE_IDS.has(id), landmark };
}

// ── GROUND-TRUTH anchor coordinates (KEPI_DESIGN_LAW M26) ──────────────────
// These are REAL coordinates read from OpenStreetMap's surveyed, satellite-
// aligned data (Overpass), NOT eyeballed and NOT reverse-engineered from our
// own derived terminal ring. SEA's departures doors are OSM `entrance` nodes
// carrying real `ref` door numbers; low numbers are SOUTH, high are NORTH:
//   Door 4  = 47.4422245, -122.300257   (OSM node/12103438752, rematch 2026-07-15)
//   Door 12 = 47.4429006, -122.3012498  (OSM node/11108219153)
//   Door 14 = 47.4432645, -122.301817   (OSM node/3732079295)
//   Door 22 = 47.4444743, -122.3008676  (OSM node/11108219161 — Alaska north)
// OSM entrance refs that break south→north numeric order (6/16/18/24) are skipped.
// Airline zones: Port of Seattle Web-Ticketing_4.16.25.pdf — never as a coordinate
// source. Do NOT gate these on SEA_OSM_FOOTPRINTS.mainTerminal (M26).
const NODES: GraphNode[] = [
  // ── Departures drop-off (central main entrance) ──
  // Anchored to OSM entrance ref=14. Rematched OSM API 2026-07-15.
  n("curb-departures", -122.301817, 47.4432645, "junction", "Departures drop-off — Door 14 (central)"),

  // ── Landside ticketing hall — each anchored to a real OSM door node ──
  n("checkin-south", -122.300257, 47.4422245, "checkin", "Ticketing — south end / Door 4 (international)"),
  n("checkin-center", -122.3012498, 47.4429006, "checkin", "Ticketing — Door 12 (center)"),
  n("checkin-north", -122.3008676, 47.4444743, "checkin", "Ticketing — north end / Door 22 (Alaska)"),
  // Interior walkway between the real central doors and the security checkpoints.
  // Kepi-curated corridor point positioned just behind central ticketing so the
  // landside route runs straight in (no landside→airside zigzag), 2026-07-14.
  n("landside-hall", -122.302000, 47.443400, "junction", "Main hall, behind central ticketing"),

  // ── Security checkpoints (entries landside, exits airside) ──
  // HONESTY BOUNDARY (M26): unlike the doors above, these coordinates are NOT
  // ground truth. OSM has NO security-checkpoint tagging (KEPI_DESIGN_LAW M15)
  // and there is no open dataset for checkpoint positions. So these are Kepi's
  // best ESTIMATE: the checkpoint *names* (Checkpoint 3 / 5) come from the public
  // flysea reference, but the lat/lng is inferred — placed sensibly just airside
  // (interior) of the real, verified doors toward the concourse core. Do not
  // present these as verified; if a real coordinate source appears, replace them.
  n("sec3-entry", -122.302100, 47.443350, "security_entry", "Checkpoint 3 — central (behind Door 12)"),
  n("sec3-exit", -122.302350, 47.443450, "security_exit", "Past Checkpoint 3"),
  n("sec5-entry", -122.302050, 47.444450, "security_entry", "Checkpoint 5 — north (behind Door 22)"),
  n("sec5-exit", -122.302300, 47.444520, "security_exit", "Past Checkpoint 5"),

  // ── Airside concourse hall (post-security) ──
  // No artificial central "hub" node: that caused routes to climb to a north hub
  // and then drop back down to a concourse neck (the M-shaped zigzag). Instead
  // each concourse ENTERS at its real neck gate and hangs off the NEARER
  // checkpoint — Checkpoint 3 (central) feeds the SOUTH piers (A, B, S-satellite
  // train, Centurion); Checkpoint 5 (north) feeds the NORTH piers (C, D, Alaska
  // Lounge, N-satellite train). Wiring each destination to its nearer checkpoint
  // keeps every common route geographically monotonic — no north→south→north
  // backtracking (M28). Every lat/lng is a real OSM aeroway=gate node, Overpass
  // 2026-07-14.

  // Concourse necks — where each pier meets the main terminal (real Gate 1)
  n("a-neck", -122.3021047, 47.4425616, "junction", "Concourse A entrance (Gate A1)"),
  n("b-neck", -122.3030223, 47.4427865, "junction", "Concourse B entrance (Gate B1)"),
  n("c-neck", -122.3033009, 47.4444182, "junction", "Concourse C entrance (Gate C2)"),
  n("d-neck", -122.3019740, 47.4446959, "junction", "Concourse D entrance (Gate D1)"),
  // Concourse A is the longest pier — one mid-spine bend (Gate A5) keeps its
  // route curving with the building down to the far gates + The Club.
  n("a-mid", -122.3002592, 47.4413052, "junction", "Concourse A mid-pier (Gate A5)"),

  // ── Concourse gate clusters (real mid-pier gate centroids, OSM) ──
  n("gate-A", -122.2991407, 47.4407319, "gate", "Concourse A gates"),
  n("gate-B", -122.3035823, 47.4416397, "gate", "Concourse B gates"),
  n("gate-C", -122.3036344, 47.4457574, "gate", "Concourse C gates"),
  n("gate-D", -122.3002166, 47.4453905, "gate", "Concourse D gates"),

  // ── Train platforms + satellites ──
  n("train-C", -122.30330, 47.44620, "train_platform", "N Gates train — red sign near Gate C18"),
  n("train-N", -122.30268, 47.44820, "train_platform", "North Satellite train platform"),
  n("gate-N", -122.30258, 47.44862, "gate", "North Satellite (N gates)"),
  n("train-S-main", -122.30200, 47.44230, "train_platform", "S Gates train — lower level, central terminal"),
  n("train-S", -122.30205, 47.43950, "train_platform", "South Satellite train platform"),
  n("gate-S", -122.30214, 47.43881, "gate", "South Satellite (S gates)"),

  // ── Lounges (real OSM positions) ──
  n("lounge-alaska-c", -122.30228, 47.44460, "lounge", "Alaska Lounge — Concourse C, upper level"),
  n("lounge-alaska-n", -122.30358, 47.44917, "lounge", "Alaska Lounge — North Satellite"),
  n("lounge-centurion", -122.30312, 47.44241, "lounge", "Amex Centurion Lounge — Central Terminal mezzanine"),
  n("lounge-club-a", -122.2975053, 47.4390585, "lounge", "The Club at SEA — Concourse A"),

  // ── Services ──
  n("restroom-central", -122.30210, 47.44345, "restroom", "Restrooms — central airside"),
];

function e(
  id: string,
  from: string,
  to: string,
  kind: GraphEdge["kind"],
  lengthM: number,
  traverseSeconds: number,
  opts?: Partial<Pick<GraphEdge, "bidirectional" | "laneType">>,
): GraphEdge {
  return {
    id,
    from,
    to,
    kind,
    lengthM,
    traverseSeconds,
    bidirectional: opts?.bidirectional ?? true,
    laneType: opts?.laneType,
  };
}

const WALK_MPS = 1.25; // ~3 mph with carry-on
const walkSecs = (m: number) => Math.round(m / WALK_MPS);

// Traverse times are calibrated from real SEA walk/train timings and stay
// authoritative for routing; the drawn polyline follows the real node coords.
const EDGES: GraphEdge[] = [
  // Departures curb → ticketing
  e("e-curb-cc", "curb-departures", "checkin-center", "walkway", 45, walkSecs(45)),
  e("e-curb-hall", "curb-departures", "landside-hall", "walkway", 60, walkSecs(60)),

  // Landside hall connections
  e("e-cs-hall", "checkin-south", "landside-hall", "walkway", 110, walkSecs(110)),
  e("e-cc-hall", "checkin-center", "landside-hall", "walkway", 20, walkSecs(20)),
  e("e-cn-hall", "checkin-north", "landside-hall", "walkway", 120, walkSecs(120)),
  // Direct north-end link so an Alaska (Door 22) traveler walks check-in → the
  // north Checkpoint 5 without dipping back through the central hall.
  e("e-cn-sec5", "checkin-north", "sec5-entry", "walkway", 110, walkSecs(110)),
  e("e-hall-sec3", "landside-hall", "sec3-entry", "walkway", 50, walkSecs(50)),
  e("e-hall-sec5", "landside-hall", "sec5-entry", "walkway", 100, walkSecs(100)),

  // Security transitions — one edge per lane type per checkpoint.
  // Wait estimates are static v1 (spec §F security-wait endpoint refines later).
  e("e-sec3-std", "sec3-entry", "sec3-exit", "security_transition", 40, 15 * 60, { bidirectional: false, laneType: "standard" }),
  e("e-sec3-pre", "sec3-entry", "sec3-exit", "security_transition", 40, 7 * 60, { bidirectional: false, laneType: "precheck" }),
  e("e-sec3-clr", "sec3-entry", "sec3-exit", "security_transition", 40, 5 * 60, { bidirectional: false, laneType: "clear" }),
  e("e-sec5-std", "sec5-entry", "sec5-exit", "security_transition", 40, 18 * 60, { bidirectional: false, laneType: "standard" }),
  e("e-sec5-pre", "sec5-entry", "sec5-exit", "security_transition", 40, 8 * 60, { bidirectional: false, laneType: "precheck" }),

  // Join the two checkpoint exits along the terminal's concourse edge so either
  // checkpoint can reach either end without inventing a central hub.
  e("e-s3x-s5x", "sec3-exit", "sec5-exit", "walkway", 115, walkSecs(115)),

  // SOUTH piers + S-satellite train + Centurion off Checkpoint 3 (central).
  // Concourse A adds a mid-pier bend (Gate A5) so its long pier curves inside.
  e("e-s3x-aneck", "sec3-exit", "a-neck", "walkway", 100, walkSecs(100)),
  e("e-aneck-amid", "a-neck", "a-mid", "walkway", 195, walkSecs(195)),
  e("e-amid-gateA", "a-mid", "gate-A", "walkway", 105, walkSecs(105)),
  e("e-s3x-bneck", "sec3-exit", "b-neck", "walkway", 90, walkSecs(90)),
  e("e-bneck-gateB", "b-neck", "gate-B", "walkway", 135, walkSecs(135)),
  e("e-s3x-trainSm", "sec3-exit", "train-S-main", "walkway", 130, walkSecs(130)),
  e("e-s3x-centurion", "sec3-exit", "lounge-centurion", "walkway", 130, walkSecs(130) + 60),
  e("e-s3x-restroom", "sec3-exit", "restroom-central", "walkway", 25, walkSecs(25)),

  // NORTH piers + N-satellite train + Alaska Lounge off Checkpoint 5 (north).
  // The Alaska Lounge (C) is at the real OSM coord right past Checkpoint 5, NOT
  // out at the Gate C cluster — hanging it here removes the out-and-back zigzag.
  e("e-s5x-cneck", "sec5-exit", "c-neck", "walkway", 80, walkSecs(80)),
  e("e-cneck-gateC", "c-neck", "gate-C", "walkway", 150, walkSecs(150)),
  e("e-s5x-dneck", "sec5-exit", "d-neck", "walkway", 40, walkSecs(40)),
  e("e-dneck-gateD", "d-neck", "gate-D", "walkway", 150, walkSecs(150)),
  e("e-s5x-loungeAKC", "sec5-exit", "lounge-alaska-c", "walkway", 20, walkSecs(20) + 30),

  // North Satellite train (per airportNavigation.ts: walk 2 + train 4 + walk 2)
  e("e-gateC-trainC", "gate-C", "train-C", "walkway", 80, 120),
  e("e-trainC-trainN", "train-C", "train-N", "train", 600, 240),
  e("e-trainN-gateN", "train-N", "gate-N", "walkway", 90, 120),

  // South Satellite train
  e("e-trainSm-trainS", "train-S-main", "train-S", "train", 700, 300),
  e("e-trainS-gateS", "train-S", "gate-S", "walkway", 70, walkSecs(70)),

  // Lounges hung off their nearest real anchor
  e("e-gateN-loungeAKN", "gate-N", "lounge-alaska-n", "walkway", 40, walkSecs(40) + 45),
  e("e-gateA-clubA", "gate-A", "lounge-club-a", "walkway", 220, walkSecs(220) + 45),
];

// ── Real terminal footprints (OpenStreetMap, extruded in the renderer) ─────
const ZONES: TerminalZonePolygon[] = [
  { id: "z-main", name: "Main Terminal", airside: false, heightM: 14, ring: SEA_OSM_FOOTPRINTS.mainTerminal },
  { id: "z-sat-n", name: "North Satellite", airside: true, heightM: 11, ring: SEA_OSM_FOOTPRINTS.northSatellite },
  { id: "z-sat-s", name: "South Satellite", airside: true, heightM: 11, ring: SEA_OSM_FOOTPRINTS.southSatellite },
];

// Curve-calibrated door/airline POIs + OSM-verified amenities (M26/M27). Airline
// counters + amenities are generated from real OSM anchors in ./seaTicketingHall.
const TICKETING = buildSeaTicketingHall();

const POIS: PoiDefinition[] = [
  // Generic bag-drop stop on the surveyed central Door 12 anchor — the journey
  // fallback when the traveler's specific airline isn't matched. Airline-specific
  // counters (Alaska…Avianca) are generated in TICKETING, each precision-tagged.
  { id: "poi-checkin-gen", nodeId: "checkin-center", category: "checkin", name: "Check-in & bag drop", doorLabel: "Door 12", precision: "surveyed" },
  {
    id: "poi-sec3",
    nodeId: "sec3-entry",
    category: "security",
    name: "Security — Checkpoint 3",
    lanes: ["standard", "precheck"],
    doorLabel: "TSA PreCheck",
    notes: "Approximate location — checkpoint pin is our best estimate near the central ticketing hall. PreCheck is normally available; checkpoint services can change with TSA operations.",
  },
  {
    id: "poi-sec5",
    nodeId: "sec5-entry",
    category: "security",
    name: "Security — Checkpoint 5",
    lanes: ["standard", "precheck"],
    doorLabel: "TSA PreCheck",
    notes: "Approximate location — checkpoint pin is our best estimate near the north end of the terminal.",
  },
  { id: "poi-gate-A", nodeId: "gate-A", category: "gate", name: "A Gates" },
  { id: "poi-gate-B", nodeId: "gate-B", category: "gate", name: "B Gates" },
  { id: "poi-gate-C", nodeId: "gate-C", category: "gate", name: "C Gates" },
  { id: "poi-gate-D", nodeId: "gate-D", category: "gate", name: "D Gates" },
  { id: "poi-gate-N", nodeId: "gate-N", category: "gate", name: "N Gates (North Satellite) · train" },
  { id: "poi-gate-S", nodeId: "gate-S", category: "gate", name: "S Gates (South Satellite) · train" },
  { id: "poi-lounge-akc", nodeId: "lounge-alaska-c", category: "lounge", name: "Alaska Lounge (C)", airline: "Alaska" },
  { id: "poi-lounge-akn", nodeId: "lounge-alaska-n", category: "lounge", name: "Alaska Lounge (N)", airline: "Alaska" },
  { id: "poi-lounge-centurion", nodeId: "lounge-centurion", category: "lounge", name: "Centurion Lounge" },
  { id: "poi-lounge-club-a", nodeId: "lounge-club-a", category: "lounge", name: "The Club at SEA (A)" },
  { id: "poi-restroom", nodeId: "restroom-central", category: "restroom", name: "Restrooms" },
  // The N/S satellite trains are NOT separate destinations. Tapping "N Gates" /
  // "S Gates" routes the full walk → train → walk in one line (the ride shows as
  // the dashed violet leg), so standalone "N Gates Train" / "S Gates Train" stops
  // were removed to end the confusing duplicate (owner, 2026-07-14). The train
  // nodes/edges (train-C, train-N, train-S-main, train-S) remain for routing.
];

const SEA_LAYOUT_BASE: AirportLayout = {
  iata: "SEA",
  name: "Seattle–Tacoma International",
  layoutVersion: "0.9.2-traveler-labels",
  updatedAt: "2026-07-15",
  center: [-122.30209, 47.44328],
  zones: ZONES,
  nodes: [...NODES, ...TICKETING.nodes],
  edges: [...EDGES, ...TICKETING.edges],
  pois: [...POIS, ...TICKETING.pois],
  gateNodeResolver: [
    { prefix: "A", nodeId: "gate-A" },
    { prefix: "B", nodeId: "gate-B" },
    { prefix: "C", nodeId: "gate-C" },
    { prefix: "D", nodeId: "gate-D" },
    { prefix: "N", nodeId: "gate-N" },
    { prefix: "S", nodeId: "gate-S" },
  ],
  routeGrade: "schematic",
};

const SEA_FOOTWAY = applyFootwayOverlay(
  SEA_LAYOUT_BASE,
  seaPedestrianWays as OsmWayLike[],
  { now: "2026-07-15" },
);

/** Live SEA layout — OSM footway overlay applied (Phase 2). */
export const SEA_LAYOUT: AirportLayout = SEA_FOOTWAY.layout;

/** Overlay warnings for admin / tests (bridges retained, thin coverage, etc.). */
export const SEA_FOOTWAY_WARNINGS: string[] = SEA_FOOTWAY.warnings;
