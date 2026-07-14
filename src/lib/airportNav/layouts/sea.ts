/**
 * SEA (Seattle–Tacoma) curated layout — pilot airport.
 *
 * GEOMETRY (2026-07-13): terminal + satellite *footprints* and node anchors are
 * now the airport's REAL shape, extracted from OpenStreetMap (see
 * ./seaFootprints.ts, `Map data © OpenStreetMap contributors`, ODbL). SEA is
 * one main terminal (concourses A–D radiate inside it) plus the North and South
 * satellites reached by underground train — not eight separate boxes.
 *
 * ROUTING (Kepi-curated, NOT from OSM): OSM has no security-checkpoint tagging
 * (KEPI_DESIGN_LAW M15), so security nodes/lanes, walkways, train links and
 * their calibrated traverse times remain hand-authored. Node coordinates are
 * real to ~tens of meters; the navigator still snaps GPS to the graph and shows
 * a confidence halo rather than trusting raw indoor GPS.
 *
 * Graph timings are seeded from src/lib/travelAssistant/airportNavigation.ts:
 *   - security → C gates: ~3 min walk straight ahead
 *   - security → N satellite: walk 2 min + train 4 min + walk 2 min
 *   - N train boards near Gate C18 ("red 'N Gates' sign")
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition, TerminalZonePolygon } from "../types";
import { SEA_OSM_FOOTPRINTS } from "./seaFootprints";
import { buildSeaTicketingHall } from "./seaTicketingHall";

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
//   Door 4  = 47.442272, -122.300184   Door 12 = 47.443169, -122.301487
//   Door 14 = 47.443522, -122.301777   Door 22 = 47.444474, -122.300868
//   Door 24 = 47.444651, -122.300607
// The flysea.org/Atrius reference (owner-supplied screenshots) is used ONLY to
// know WHICH airline/checkpoint sits at which door — Alaska at the north end,
// international carriers at the south — never as a coordinate source. Do NOT
// gate these coordinates on SEA_OSM_FOOTPRINTS.mainTerminal: that ring is a
// simplified, decorative backdrop and a verified door can fall just outside it
// (Door 4 does) — the real coordinate wins (M26 supersedes M23's polygon gate).
const NODES: GraphNode[] = [
  // ── Departures drop-off (central main entrance) ──
  // Anchored to OSM entrance ref=14 (central departures doors). Verified via OSM
  // Overpass entrance-ref query, 2026-07-14.
  n("curb-departures", -122.301777, 47.443522, "junction", "Departures drop-off — Door 14 (central)"),

  // ── Landside ticketing hall — each anchored to a real OSM door node ──
  // Verified via OSM Overpass entrance `ref` coordinates, 2026-07-14. Airline
  // section (which door) comes from the public flysea map ordering; the lat/lng
  // is the real door coordinate, not an estimate.
  n("checkin-south", -122.300184, 47.442272, "checkin", "Ticketing — south end / Door 4 (international)"),
  n("checkin-center", -122.301487, 47.443169, "checkin", "Ticketing — center / Door 12 (Delta, United)"),
  n("checkin-north", -122.300607, 47.444651, "checkin", "Ticketing — north end / Door 24 (Alaska)"),
  // Interior walkway between the real central doors and the airside core (where
  // the A/B/C/D gate arms converge). Kepi-curated corridor point, positioned
  // between real Door 12/14 and airside-central so the route runs straight in
  // (no landside→airside zigzag), 2026-07-14.
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
  n("sec5-entry", -122.302050, 47.444450, "security_entry", "Checkpoint 5 — north (behind Door 22–24)"),
  n("sec5-exit", -122.302300, 47.444520, "security_exit", "Past Checkpoint 5"),

  // ── Airside central spine ──
  n("airside-central", -122.30210, 47.44340, "junction", "Central airside concourse"),
  n("airside-south", -122.30190, 47.44120, "junction", "South airside — toward A/B gates"),
  n("airside-north", -122.30200, 47.44540, "junction", "North airside — toward C/D gates"),

  // ── Concourse anchors (real gate-cluster centroids) ──
  n("gate-A", -122.29917, 47.44026, "gate", "Concourse A gates"),
  n("gate-B", -122.30376, 47.44159, "gate", "Concourse B gates"),
  n("gate-C", -122.30381, 47.44554, "gate", "Concourse C gates"),
  n("gate-D", -122.29997, 47.44577, "gate", "Concourse D gates"),

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
  n("lounge-club-a", -122.29950, 47.44060, "lounge", "The Club at SEA — Concourse A"),

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
  e("e-hall-sec3", "landside-hall", "sec3-entry", "walkway", 50, walkSecs(50)),
  e("e-hall-sec5", "landside-hall", "sec5-entry", "walkway", 100, walkSecs(100)),

  // Security transitions — one edge per lane type per checkpoint.
  // Wait estimates are static v1 (spec §F security-wait endpoint refines later).
  e("e-sec3-std", "sec3-entry", "sec3-exit", "security_transition", 40, 15 * 60, { bidirectional: false, laneType: "standard" }),
  e("e-sec3-pre", "sec3-entry", "sec3-exit", "security_transition", 40, 7 * 60, { bidirectional: false, laneType: "precheck" }),
  e("e-sec3-clr", "sec3-entry", "sec3-exit", "security_transition", 40, 5 * 60, { bidirectional: false, laneType: "clear" }),
  e("e-sec5-std", "sec5-entry", "sec5-exit", "security_transition", 40, 18 * 60, { bidirectional: false, laneType: "standard" }),
  e("e-sec5-pre", "sec5-entry", "sec5-exit", "security_transition", 40, 8 * 60, { bidirectional: false, laneType: "precheck" }),

  // Airside spine
  e("e-s3x-central", "sec3-exit", "airside-central", "walkway", 60, walkSecs(60)),
  e("e-s5x-north", "sec5-exit", "airside-north", "walkway", 60, walkSecs(60)),
  e("e-central-south", "airside-central", "airside-south", "walkway", 150, walkSecs(150)),
  e("e-central-north", "airside-central", "airside-north", "walkway", 150, walkSecs(150)),

  // Concourses
  e("e-south-gateA", "airside-south", "gate-A", "walkway", 180, walkSecs(180)),
  e("e-south-gateB", "airside-south", "gate-B", "walkway", 160, walkSecs(160)),
  e("e-north-gateC", "airside-north", "gate-C", "walkway", 160, walkSecs(160)),
  e("e-north-gateD", "airside-north", "gate-D", "walkway", 170, walkSecs(170)),

  // North Satellite train (per airportNavigation.ts: walk 2 + train 4 + walk 2)
  e("e-gateC-trainC", "gate-C", "train-C", "walkway", 80, 120),
  e("e-trainC-trainN", "train-C", "train-N", "train", 600, 240),
  e("e-trainN-gateN", "train-N", "gate-N", "walkway", 90, 120),

  // South Satellite train
  e("e-central-trainSm", "airside-central", "train-S-main", "walkway", 90, walkSecs(90)),
  e("e-trainSm-trainS", "train-S-main", "train-S", "train", 700, 300),
  e("e-trainS-gateS", "train-S", "gate-S", "walkway", 70, walkSecs(70)),

  // Lounges + services
  e("e-gateC-loungeAK", "gate-C", "lounge-alaska-c", "walkway", 60, walkSecs(60) + 45),
  e("e-gateN-loungeAKN", "gate-N", "lounge-alaska-n", "walkway", 40, walkSecs(40) + 45),
  e("e-central-centurion", "airside-central", "lounge-centurion", "walkway", 70, walkSecs(70) + 60),
  e("e-gateA-clubA", "gate-A", "lounge-club-a", "walkway", 50, walkSecs(50) + 45),
  e("e-central-restroom", "airside-central", "restroom-central", "walkway", 30, walkSecs(30)),
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
  { id: "poi-gate-N", nodeId: "gate-N", category: "gate", name: "N Gates (North Satellite)" },
  { id: "poi-gate-S", nodeId: "gate-S", category: "gate", name: "S Gates (South Satellite)" },
  { id: "poi-lounge-akc", nodeId: "lounge-alaska-c", category: "lounge", name: "Alaska Lounge (C)", airline: "Alaska" },
  { id: "poi-lounge-akn", nodeId: "lounge-alaska-n", category: "lounge", name: "Alaska Lounge (N)", airline: "Alaska" },
  { id: "poi-lounge-centurion", nodeId: "lounge-centurion", category: "lounge", name: "Centurion Lounge" },
  { id: "poi-lounge-club-a", nodeId: "lounge-club-a", category: "lounge", name: "The Club at SEA (A)" },
  { id: "poi-restroom", nodeId: "restroom-central", category: "restroom", name: "Restrooms" },
  { id: "poi-train-n", nodeId: "train-C", category: "train", name: "N Gates Train" },
  { id: "poi-train-s", nodeId: "train-S-main", category: "train", name: "S Gates Train" },
];

export const SEA_LAYOUT: AirportLayout = {
  iata: "SEA",
  name: "Seattle–Tacoma International",
  layoutVersion: "0.6.0-full-ticketing-hall",
  updatedAt: "2026-07-14",
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
};
