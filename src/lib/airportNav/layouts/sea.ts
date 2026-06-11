/**
 * SEA (Seattle–Tacoma) curated layout — Phase 0 pilot airport.
 *
 * IMPORTANT HONESTY NOTE: this is a SCHEMATIC v1 layout. Building footprints
 * and node coordinates are approximate (±50–100m). The navigator never trusts
 * raw GPS against this geometry — positions are snapped to the walkway graph
 * and rendered with a confidence halo. Refine coordinates with an on-site
 * curation pass (see spec §H Phase 0 risks) before removing the beta label.
 *
 * Graph timings are seeded from src/lib/travelAssistant/airportNavigation.ts:
 *   - security → C gates: ~3 min walk straight ahead
 *   - security → N satellite: walk 2 min + train 4 min + walk 2 min
 *   - N train boards near Gate C18 ("red 'N Gates' sign")
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition, TerminalZonePolygon } from "../types";

// ── Anchor coordinates (approximate, schematic) ────────────────────────────
// Main terminal runs roughly N–S just west of International Blvd.
const MAIN_LNG = -122.3005;

// Landside node ids — everything else in this layout is past security.
// (security_entry sits landside; security_exit sits airside.)
const LANDSIDE_NODE_IDS = new Set([
  "checkin-south", "checkin-center", "checkin-north", "landside-hall",
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

const LAT_BASE = 47.4428; // south end of ticketing hall (approx)

const NODES: GraphNode[] = [
  // ── Landside ticketing hall (north/center/south zones) ──
  n("checkin-south", MAIN_LNG + 0.0006, LAT_BASE + 0.0004, "checkin", "Ticketing — south end (Alaska)"),
  n("checkin-center", MAIN_LNG + 0.0006, LAT_BASE + 0.0016, "checkin", "Ticketing — center (Delta, United)"),
  n("checkin-north", MAIN_LNG + 0.0006, LAT_BASE + 0.0028, "checkin", "Ticketing — north end (international)"),
  n("landside-hall", MAIN_LNG + 0.0004, LAT_BASE + 0.0016, "junction", "Main hall, behind ticketing"),

  // ── Security checkpoints (entries landside, exits airside) ──
  n("sec3-entry", MAIN_LNG + 0.0002, LAT_BASE + 0.0012, "security_entry", "Checkpoint 3 — center of the hall"),
  n("sec3-exit", MAIN_LNG - 0.0002, LAT_BASE + 0.0012, "security_exit", "Past Checkpoint 3"),
  n("sec5-entry", MAIN_LNG + 0.0002, LAT_BASE + 0.0024, "security_entry", "Checkpoint 5 — north end"),
  n("sec5-exit", MAIN_LNG - 0.0002, LAT_BASE + 0.0024, "security_exit", "Past Checkpoint 5"),

  // ── Airside central spine ──
  n("airside-central", MAIN_LNG - 0.0006, LAT_BASE + 0.0016, "junction", "Central airside concourse"),
  n("airside-south", MAIN_LNG - 0.0006, LAT_BASE + 0.0004, "junction", "South airside — toward A/B gates"),
  n("airside-north", MAIN_LNG - 0.0006, LAT_BASE + 0.0028, "junction", "North airside — toward C/D gates"),

  // ── Concourse anchors (gate clusters) ──
  n("gate-A", MAIN_LNG - 0.0002, LAT_BASE - 0.0010, "gate", "Concourse A gates"),
  n("gate-B", MAIN_LNG - 0.0014, LAT_BASE - 0.0002, "gate", "Concourse B gates"),
  n("gate-C", MAIN_LNG - 0.0014, LAT_BASE + 0.0030, "gate", "Concourse C gates"),
  n("gate-D", MAIN_LNG - 0.0002, LAT_BASE + 0.0040, "gate", "Concourse D gates"),

  // ── Train platforms + satellites ──
  n("train-C", MAIN_LNG - 0.0016, LAT_BASE + 0.0034, "train_platform", "N Gates train — red sign near Gate C18"),
  n("train-N", MAIN_LNG - 0.0034, LAT_BASE + 0.0050, "train_platform", "North Satellite train platform"),
  n("gate-N", MAIN_LNG - 0.0038, LAT_BASE + 0.0056, "gate", "North Satellite (N gates)"),
  n("train-S-main", MAIN_LNG - 0.0010, LAT_BASE + 0.0010, "train_platform", "S Gates train — lower level, central terminal"),
  n("train-S", MAIN_LNG - 0.0040, LAT_BASE - 0.0006, "train_platform", "South Satellite train platform"),
  n("gate-S", MAIN_LNG - 0.0044, LAT_BASE - 0.0010, "gate", "South Satellite (S gates)"),

  // ── Lounges ──
  n("lounge-alaska-c", MAIN_LNG - 0.0012, LAT_BASE + 0.0026, "lounge", "Alaska Lounge — Concourse C, upper level"),
  n("lounge-alaska-n", MAIN_LNG - 0.0037, LAT_BASE + 0.0054, "lounge", "Alaska Lounge — North Satellite"),
  n("lounge-centurion", MAIN_LNG - 0.0007, LAT_BASE + 0.0020, "lounge", "Amex Centurion Lounge — Central Terminal mezzanine"),
  n("lounge-club-a", MAIN_LNG - 0.0001, LAT_BASE - 0.0008, "lounge", "The Club at SEA — Concourse A"),

  // ── Services ──
  n("restroom-central", MAIN_LNG - 0.0007, LAT_BASE + 0.0014, "restroom", "Restrooms — central airside"),
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

const EDGES: GraphEdge[] = [
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

// ── Schematic footprint polygons (extruded in the renderer) ────────────────
function rect(
  id: string,
  name: string,
  cLng: number,
  cLat: number,
  wDeg: number,
  hDeg: number,
  airside: boolean,
  heightM: number,
): TerminalZonePolygon {
  const hw = wDeg / 2;
  const hh = hDeg / 2;
  return {
    id,
    name,
    airside,
    heightM,
    ring: [
      [cLng - hw, cLat - hh],
      [cLng + hw, cLat - hh],
      [cLng + hw, cLat + hh],
      [cLng - hw, cLat + hh],
      [cLng - hw, cLat - hh],
    ],
  };
}

const ZONES: TerminalZonePolygon[] = [
  rect("z-main", "Main Terminal", MAIN_LNG + 0.0002, LAT_BASE + 0.0016, 0.0014, 0.0036, false, 14),
  rect("z-airside", "Central Concourse", MAIN_LNG - 0.0007, LAT_BASE + 0.0016, 0.0008, 0.0034, true, 12),
  rect("z-conc-a", "Concourse A", MAIN_LNG - 0.0001, LAT_BASE - 0.0009, 0.0010, 0.0010, true, 10),
  rect("z-conc-b", "Concourse B", MAIN_LNG - 0.0014, LAT_BASE - 0.0002, 0.0010, 0.0010, true, 10),
  rect("z-conc-c", "Concourse C", MAIN_LNG - 0.0014, LAT_BASE + 0.0030, 0.0012, 0.0012, true, 10),
  rect("z-conc-d", "Concourse D", MAIN_LNG - 0.0002, LAT_BASE + 0.0040, 0.0010, 0.0010, true, 10),
  rect("z-sat-n", "North Satellite", MAIN_LNG - 0.0038, LAT_BASE + 0.0055, 0.0014, 0.0012, true, 10),
  rect("z-sat-s", "South Satellite", MAIN_LNG - 0.0043, LAT_BASE - 0.0009, 0.0014, 0.0012, true, 10),
];

const POIS: PoiDefinition[] = [
  { id: "poi-checkin-as", nodeId: "checkin-south", category: "checkin", name: "Alaska check-in", airline: "Alaska" },
  { id: "poi-checkin-dl", nodeId: "checkin-center", category: "checkin", name: "Delta check-in", airline: "Delta" },
  { id: "poi-checkin-ua", nodeId: "checkin-center", category: "checkin", name: "United check-in", airline: "United" },
  { id: "poi-checkin-gen", nodeId: "checkin-center", category: "checkin", name: "Check-in & bag drop" },
  {
    id: "poi-sec3",
    nodeId: "sec3-entry",
    category: "security",
    name: "Security — Checkpoint 3",
    lanes: ["standard", "precheck", "clear"],
    notes: "CLEAR pods are LEFT of the PreCheck queue entrance",
  },
  {
    id: "poi-sec5",
    nodeId: "sec5-entry",
    category: "security",
    name: "Security — Checkpoint 5",
    lanes: ["standard", "precheck"],
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
  layoutVersion: "0.1.0-beta-schematic",
  updatedAt: "2026-06-10",
  center: [MAIN_LNG - 0.0006, LAT_BASE + 0.0016],
  zones: ZONES,
  nodes: NODES,
  edges: EDGES,
  pois: POIS,
  gateNodeResolver: [
    { prefix: "A", nodeId: "gate-A" },
    { prefix: "B", nodeId: "gate-B" },
    { prefix: "C", nodeId: "gate-C" },
    { prefix: "D", nodeId: "gate-D" },
    { prefix: "N", nodeId: "gate-N" },
    { prefix: "S", nodeId: "gate-S" },
  ],
};
