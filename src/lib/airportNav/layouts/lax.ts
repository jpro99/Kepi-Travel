/**
 * LAX (Los Angeles International) curated layout — airport #2.
 *
 * Built with the KEPI_DESIGN_LAW M29 new-airport playbook. LAX is NOT one
 * terminal: it is a horseshoe of independent terminals (T1, T2, T3, Tom Bradley/
 * TBIT, T4, T6, T7, T8) plus the West Gates (Midfield Satellite Concourse,
 * reached from TBIT by an underground pedestrian tunnel). Each terminal is a
 * self-contained curb → checkpoint → gates unit; you are dropped at YOUR
 * terminal, so routes are judged per-terminal (M29 nearest-curb backtrack rule).
 *
 * HONESTY TIERS (verify-first, rule 50):
 *  - SURVEYED (real OSM, Overpass 2026-07-14, `Map data © OpenStreetMap
 *    contributors`, ODbL): every gate-cluster centroid, every lounge, and the
 *    terminal footprints (./laxFootprints.ts). Gate clusters are the real
 *    centroid of that terminal's OSM `aeroway=gate` nodes.
 *  - ESTIMATE (Kepi-curated, clearly labeled): curbs sit at the real OSM terminal
 *    building centroid; security checkpoints are interpolated between curb and
 *    gates. OSM has NO checkpoint tagging (M15) and no curb/door refs for LAX,
 *    so these are best estimates — never presented as surveyed.
 *  - COVERAGE GAP: OSM currently has no Terminal 5 polygon or gates, so T5 is
 *    intentionally omitted rather than fabricated. Add it when OSM/ground truth
 *    is available.
 *
 * Inter-terminal walking follows the departures-level frontage (the horseshoe
 * sidewalk). The LAX Automated People Mover (APM) is not modeled yet.
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition, TerminalZonePolygon } from "../types";
import { LAX_OSM_FOOTPRINTS } from "./laxFootprints";

const EARTH_M_PER_DEG_LAT = 111_320;
function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}
const WALK_MPS = 1.25;
const walkSecs = (m: number) => Math.max(5, Math.round(m / WALK_MPS));

/**
 * Per-terminal verified geometry. `curb` = real OSM building centroid (landside
 * anchor). `gate` = real OSM gate-cluster centroid (SURVEYED). `secEntry`/
 * `secExit` = ESTIMATE, interpolated ~40/60% curb→gate.
 */
interface TerminalSpec {
  id: string;
  name: string;
  gateLabel: string;
  curb: [number, number];
  secEntry: [number, number];
  secExit: [number, number];
  gate: [number, number];
}

const TERMINALS: TerminalSpec[] = [
  // North arm (gates extend north of the frontage road).
  { id: "t1", name: "Terminal 1", gateLabel: "Terminal 1 gates (9–20)",
    curb: [-118.400801, 33.946380], secEntry: [-118.401025, 33.946598], secExit: [-118.401136, 33.946706], gate: [-118.401360, 33.946924] },
  { id: "t2", name: "Terminal 2", gateLabel: "Terminal 2 gates (21–28)",
    curb: [-118.404007, 33.946129], secEntry: [-118.404015, 33.946322], secExit: [-118.404018, 33.946419], gate: [-118.404026, 33.946612] },
  { id: "t3", name: "Terminal 3", gateLabel: "Terminal 3 gates (30–38)",
    curb: [-118.406739, 33.945805], secEntry: [-118.406975, 33.946019], secExit: [-118.407092, 33.946127], gate: [-118.407328, 33.946341] },
  // West curve — Tom Bradley International Terminal.
  { id: "tbit", name: "Tom Bradley International Terminal", gateLabel: "TBIT gates (130–159)",
    curb: [-118.409903, 33.942920], secEntry: [-118.410082, 33.943011], secExit: [-118.410172, 33.943056], gate: [-118.410351, 33.943147] },
  // South arm (gates extend south of the frontage road). T5 omitted (no OSM).
  { id: "t4", name: "Terminal 4", gateLabel: "Terminal 4 gates (40–49)",
    curb: [-118.406979, 33.941711], secEntry: [-118.407066, 33.941243], secExit: [-118.407110, 33.941009], gate: [-118.406761, 33.940540] },
  { id: "t6", name: "Terminal 6", gateLabel: "Terminal 6 gates (60–69)",
    curb: [-118.402001, 33.941800], secEntry: [-118.402005, 33.941516], secExit: [-118.402008, 33.941375], gate: [-118.402012, 33.941091] },
  { id: "t7", name: "Terminal 7", gateLabel: "Terminal 7 gates (70–79)",
    curb: [-118.399656, 33.941891], secEntry: [-118.399660, 33.941733], secExit: [-118.399661, 33.941654], gate: [-118.399665, 33.941496] },
  { id: "t8", name: "Terminal 8", gateLabel: "Terminal 8 gates (80–86)",
    curb: [-118.397657, 33.942421], secEntry: [-118.397587, 33.942229], secExit: [-118.397552, 33.942134], gate: [-118.397482, 33.941942] },
];

// West Gates (Midfield Satellite) — airside satellite reached from TBIT by the
// underground pedestrian tunnel. Real OSM gate centroid (SURVEYED).
const WEST_GATE: [number, number] = [-118.414412, 33.941113];

// Landside frontage walk order around the horseshoe (T5 skipped — no OSM).
const CURB_CHAIN = ["t1", "t2", "t3", "tbit", "t4", "t6", "t7", "t8"];

// Marquee lounges — real OSM coordinates (SURVEYED, Overpass 2026-07-14).
interface LoungeSpec { id: string; name: string; pos: [number, number]; hangOff: string; airline?: string; }
const LOUNGES: LoungeSpec[] = [
  { id: "lounge-centurion", name: "Amex Centurion Lounge (TBIT)", pos: [-118.409300, 33.942870], hangOff: "gate-tbit" },
  { id: "lounge-star", name: "Star Alliance Lounge (TBIT)", pos: [-118.409842, 33.942962], hangOff: "gate-tbit" },
  { id: "lounge-oneworld", name: "oneWorld Lounge (TBIT)", pos: [-118.409851, 33.942980], hangOff: "gate-tbit" },
  { id: "lounge-qantas", name: "Qantas First Lounge (TBIT)", pos: [-118.409930, 33.943730], hangOff: "gate-tbit" },
  { id: "lounge-admirals", name: "American Admirals Club (T4)", pos: [-118.410131, 33.941677], hangOff: "gate-t4", airline: "American" },
  { id: "lounge-united-club", name: "United Club (T7)", pos: [-118.400130, 33.942841], hangOff: "gate-t7", airline: "United" },
  { id: "lounge-polaris", name: "United Polaris Lounge (T7)", pos: [-118.399869, 33.941353], hangOff: "gate-t7", airline: "United" },
];

function buildLax(): { nodes: GraphNode[]; edges: GraphEdge[]; pois: PoiDefinition[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const pois: PoiDefinition[] = [];
  const curbId = (t: string) => `curb-${t}`;

  for (const t of TERMINALS) {
    const secEntryId = `sec-${t.id}-entry`;
    const secExitId = `sec-${t.id}-exit`;
    const gateId = `gate-${t.id}`;

    nodes.push({ id: curbId(t.id), pos: t.curb, kind: "junction", airside: false, landmark: `${t.name} — ticketing & curb (drop-off)` });
    nodes.push({ id: secEntryId, pos: t.secEntry, kind: "security_entry", airside: false, landmark: `${t.name} security checkpoint` });
    nodes.push({ id: secExitId, pos: t.secExit, kind: "security_exit", airside: true, landmark: `${t.name} — past security` });
    nodes.push({ id: gateId, pos: t.gate, kind: "gate", airside: true, landmark: t.gateLabel });

    const curbToSec = metersBetween(t.curb, t.secEntry);
    edges.push({ id: `e-${t.id}-curb-sec`, from: curbId(t.id), to: secEntryId, kind: "walkway", lengthM: Math.max(15, curbToSec), traverseSeconds: walkSecs(Math.max(15, curbToSec)), bidirectional: true });
    edges.push({ id: `e-${t.id}-sec-std`, from: secEntryId, to: secExitId, kind: "security_transition", lengthM: 40, traverseSeconds: 13 * 60, bidirectional: false, laneType: "standard" });
    edges.push({ id: `e-${t.id}-sec-pre`, from: secEntryId, to: secExitId, kind: "security_transition", lengthM: 40, traverseSeconds: 6 * 60, bidirectional: false, laneType: "precheck" });
    const secToGate = metersBetween(t.secExit, t.gate);
    edges.push({ id: `e-${t.id}-sec-gate`, from: secExitId, to: gateId, kind: "walkway", lengthM: Math.max(15, secToGate), traverseSeconds: walkSecs(Math.max(15, secToGate)), bidirectional: true });

    pois.push({ id: `poi-gate-${t.id}`, nodeId: gateId, category: "gate", name: t.gateLabel, precision: "surveyed" });
    pois.push({
      id: `poi-sec-${t.id}`, nodeId: secEntryId, category: "security", name: `${t.name} security`,
      lanes: ["standard", "precheck"],
      notes: "Approximate location — LAX checkpoints are not in OpenStreetMap; the pin is Kepi's best estimate inside the terminal toward the gates. Most terminals offer TSA PreCheck.",
    });
    pois.push({ id: `poi-checkin-${t.id}`, nodeId: curbId(t.id), category: "checkin", name: `${t.name} check-in`, precision: "schematic" });
  }

  // Landside frontage walk between adjacent terminals (departures-level sidewalk).
  for (let i = 0; i < CURB_CHAIN.length - 1; i += 1) {
    const a = TERMINALS.find((t) => t.id === CURB_CHAIN[i])!;
    const b = TERMINALS.find((t) => t.id === CURB_CHAIN[i + 1])!;
    const len = metersBetween(a.curb, b.curb);
    edges.push({ id: `e-frontage-${a.id}-${b.id}`, from: curbId(a.id), to: curbId(b.id), kind: "walkway", lengthM: len, traverseSeconds: walkSecs(len), bidirectional: true });
  }

  // West Gates satellite — airside tunnel from TBIT gates (moving walkways).
  nodes.push({ id: "gate-west", pos: WEST_GATE, kind: "gate", airside: true, landmark: "West Gates (201–235) · Midfield Satellite" });
  const tunnelLen = metersBetween([-118.410351, 33.943147], WEST_GATE);
  edges.push({ id: "e-tbit-west", from: "gate-tbit", to: "gate-west", kind: "moving_walkway", lengthM: tunnelLen, traverseSeconds: Math.round(tunnelLen / 1.0) + 120, bidirectional: true });
  pois.push({ id: "poi-gate-west", nodeId: "gate-west", category: "gate", name: "West Gates (201–235) · tunnel from TBIT", precision: "surveyed" });

  // Lounges — real OSM, hung off the nearest EXISTING airside node (checkpoint
  // exit or gate cluster) so the walk doesn't detour out to the gates and back.
  for (const l of LOUNGES) {
    nodes.push({ id: l.id, pos: l.pos, kind: "lounge", airside: true, landmark: l.name });
    const anchor = nodes
      .filter((n) => n.airside && (n.kind === "security_exit" || n.kind === "gate") && n.id.includes(l.hangOff.replace("gate-", "")))
      .concat(nodes.filter((n) => n.airside && n.kind === "gate" && n.id === l.hangOff))
      .sort((a, b) => metersBetween(a.pos, l.pos) - metersBetween(b.pos, l.pos))[0]
      ?? nodes.find((n) => n.id === l.hangOff)!;
    const len = metersBetween(anchor.pos, l.pos);
    edges.push({ id: `e-${anchor.id}-${l.id}`, from: anchor.id, to: l.id, kind: "walkway", lengthM: Math.max(15, len), traverseSeconds: walkSecs(Math.max(15, len)) + 30, bidirectional: true });
    pois.push({ id: `poi-${l.id}`, nodeId: l.id, category: "lounge", name: l.name, airline: l.airline, precision: "surveyed" });
  }

  return { nodes, edges, pois };
}

const BUILT = buildLax();

const ZONES: TerminalZonePolygon[] = [
  { id: "z-t1", name: "Terminal 1", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal1 },
  { id: "z-t2", name: "Terminal 2", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal2 },
  { id: "z-t3", name: "Terminal 3", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal3 },
  { id: "z-tbit", name: "Tom Bradley International Terminal", airside: false, heightM: 18, ring: LAX_OSM_FOOTPRINTS.tbit },
  { id: "z-west", name: "West Gates (Midfield Satellite)", airside: true, heightM: 16, ring: LAX_OSM_FOOTPRINTS.westGates },
  { id: "z-t4", name: "Terminal 4", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal4 },
  { id: "z-t6", name: "Terminal 6", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal6 },
  { id: "z-t7", name: "Terminal 7", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal7 },
  { id: "z-t8", name: "Terminal 8", airside: false, heightM: 14, ring: LAX_OSM_FOOTPRINTS.terminal8 },
];

export const LAX_LAYOUT: AirportLayout = {
  iata: "LAX",
  name: "Los Angeles International",
  layoutVersion: "0.1.0-osm-horseshoe",
  updatedAt: "2026-07-14",
  center: [-118.40853, 33.94254],
  zones: ZONES,
  nodes: BUILT.nodes,
  edges: BUILT.edges,
  pois: BUILT.pois,
  gateNodeResolver: [
    { prefix: "9", nodeId: "gate-t1" },
    { prefix: "11", nodeId: "gate-t1" }, { prefix: "12", nodeId: "gate-t1" }, { prefix: "13", nodeId: "gate-t1" },
    { prefix: "14", nodeId: "gate-t1" }, { prefix: "15", nodeId: "gate-t1" }, { prefix: "16", nodeId: "gate-t1" },
    { prefix: "17", nodeId: "gate-t1" }, { prefix: "18", nodeId: "gate-t1" }, { prefix: "20", nodeId: "gate-t1" },
    { prefix: "21", nodeId: "gate-t2" }, { prefix: "22", nodeId: "gate-t2" }, { prefix: "23", nodeId: "gate-t2" },
    { prefix: "24", nodeId: "gate-t2" }, { prefix: "25", nodeId: "gate-t2" }, { prefix: "26", nodeId: "gate-t2" },
    { prefix: "27", nodeId: "gate-t2" }, { prefix: "28", nodeId: "gate-t2" },
    { prefix: "30", nodeId: "gate-t3" }, { prefix: "31", nodeId: "gate-t3" }, { prefix: "32", nodeId: "gate-t3" },
    { prefix: "33", nodeId: "gate-t3" }, { prefix: "34", nodeId: "gate-t3" }, { prefix: "35", nodeId: "gate-t3" },
    { prefix: "36", nodeId: "gate-t3" }, { prefix: "37", nodeId: "gate-t3" }, { prefix: "38", nodeId: "gate-t3" },
    { prefix: "40", nodeId: "gate-t4" }, { prefix: "41", nodeId: "gate-t4" }, { prefix: "42", nodeId: "gate-t4" },
    { prefix: "46", nodeId: "gate-t4" }, { prefix: "48", nodeId: "gate-t4" }, { prefix: "49", nodeId: "gate-t4" },
    { prefix: "60", nodeId: "gate-t6" }, { prefix: "61", nodeId: "gate-t6" }, { prefix: "62", nodeId: "gate-t6" },
    { prefix: "63", nodeId: "gate-t6" }, { prefix: "64", nodeId: "gate-t6" }, { prefix: "65", nodeId: "gate-t6" },
    { prefix: "66", nodeId: "gate-t6" }, { prefix: "67", nodeId: "gate-t6" }, { prefix: "68", nodeId: "gate-t6" },
    { prefix: "69", nodeId: "gate-t6" },
    { prefix: "70", nodeId: "gate-t7" }, { prefix: "71", nodeId: "gate-t7" }, { prefix: "72", nodeId: "gate-t7" },
    { prefix: "73", nodeId: "gate-t7" }, { prefix: "74", nodeId: "gate-t7" }, { prefix: "75", nodeId: "gate-t7" },
    { prefix: "76", nodeId: "gate-t7" }, { prefix: "77", nodeId: "gate-t7" },
    { prefix: "80", nodeId: "gate-t8" }, { prefix: "81", nodeId: "gate-t8" }, { prefix: "82", nodeId: "gate-t8" },
    { prefix: "83", nodeId: "gate-t8" }, { prefix: "84", nodeId: "gate-t8" }, { prefix: "85", nodeId: "gate-t8" },
    { prefix: "86", nodeId: "gate-t8" },
    // TBIT (130–159) — 3-digit prefixes win over the 2-digit T1/T3 ones above.
    { prefix: "130", nodeId: "gate-tbit" }, { prefix: "131", nodeId: "gate-tbit" }, { prefix: "132", nodeId: "gate-tbit" },
    { prefix: "133", nodeId: "gate-tbit" }, { prefix: "134", nodeId: "gate-tbit" }, { prefix: "135", nodeId: "gate-tbit" },
    { prefix: "137", nodeId: "gate-tbit" }, { prefix: "139", nodeId: "gate-tbit" }, { prefix: "141", nodeId: "gate-tbit" },
    { prefix: "148", nodeId: "gate-tbit" }, { prefix: "150", nodeId: "gate-tbit" }, { prefix: "151", nodeId: "gate-tbit" },
    { prefix: "152", nodeId: "gate-tbit" }, { prefix: "153", nodeId: "gate-tbit" }, { prefix: "154", nodeId: "gate-tbit" },
    { prefix: "155", nodeId: "gate-tbit" }, { prefix: "156", nodeId: "gate-tbit" }, { prefix: "157", nodeId: "gate-tbit" },
    { prefix: "159", nodeId: "gate-tbit" },
    // West Gates (201–235).
    { prefix: "201", nodeId: "gate-west" }, { prefix: "203", nodeId: "gate-west" }, { prefix: "205", nodeId: "gate-west" },
    { prefix: "207", nodeId: "gate-west" }, { prefix: "221", nodeId: "gate-west" }, { prefix: "225", nodeId: "gate-west" },
    { prefix: "227", nodeId: "gate-west" }, { prefix: "229", nodeId: "gate-west" }, { prefix: "230", nodeId: "gate-west" },
    { prefix: "231", nodeId: "gate-west" }, { prefix: "232", nodeId: "gate-west" }, { prefix: "233", nodeId: "gate-west" },
    { prefix: "235", nodeId: "gate-west" },
  ],
};
