/**
 * ONT (Ontario International, Ontario CA) curated layout — airport #3.
 *
 * Built with the KEPI_DESIGN_LAW M29 new-airport playbook. ONT is a small,
 * compact airport: two linear passenger terminals (Terminal 2, gates 201–213;
 * Terminal 4, gates 401–414) side by side, plus an International Arrivals
 * building (arrivals only — no departure gates). Gates face south toward the
 * apron; ticketing/curb is on the north side. The two terminals are connected
 * landside along the terminal frontage.
 *
 * HONESTY TIERS (verify-first, rule 50):
 *  - SURVEYED (real OSM, Overpass 2026-07-15, `Map data © OpenStreetMap
 *    contributors`, ODbL): both gate-cluster centroids, the Aspire lounge, and
 *    the Terminal 4 + International Arrivals footprints (./ontFootprints.ts).
 *  - ESTIMATE (Kepi-curated, labeled): curbs and security checkpoints. Terminal
 *    4's curb uses its real OSM building centroid; Terminal 2 has NO OSM building
 *    polygon, so its curb is estimated ~60 m north of the gate line. OSM has no
 *    checkpoint tagging (M15) — checkpoints are interpolated curb→gate.
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition, TerminalZonePolygon } from "../types";
import { ONT_OSM_FOOTPRINTS } from "./ontFootprints";

const EARTH_M_PER_DEG_LAT = 111_320;
function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}
const WALK_MPS = 1.25;
const walkSecs = (m: number) => Math.max(5, Math.round(m / WALK_MPS));

interface TerminalSpec {
  id: string;
  name: string;
  gateLabel: string;
  curb: [number, number];
  secEntry: [number, number];
  secExit: [number, number];
  gate: [number, number]; // SURVEYED — real OSM gate-cluster centroid
}

const TERMINALS: TerminalSpec[] = [
  // Terminal 2 — curb ESTIMATE (~60 m north of gates; no OSM building polygon).
  { id: "t2", name: "Terminal 2", gateLabel: "Terminal 2 gates (201–213)",
    curb: [-117.597375, 34.060686], secEntry: [-117.597375, 34.060470], secExit: [-117.597375, 34.060308], gate: [-117.597375, 34.060146] },
  // Terminal 4 — curb = real OSM building centroid.
  { id: "t4", name: "Terminal 4", gateLabel: "Terminal 4 gates (401–414)",
    curb: [-117.588100, 34.060290], secEntry: [-117.587794, 34.060237], secExit: [-117.587642, 34.060211], gate: [-117.587336, 34.060158] },
];

// Aspire Airport Lounge — real OSM coordinate (SURVEYED), Terminal 2 airside.
const ASPIRE: [number, number] = [-117.596516, 34.060242];

function buildOnt(): { nodes: GraphNode[]; edges: GraphEdge[]; pois: PoiDefinition[] } {
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

    const curbToSec = Math.max(15, metersBetween(t.curb, t.secEntry));
    edges.push({ id: `e-${t.id}-curb-sec`, from: curbId(t.id), to: secEntryId, kind: "walkway", lengthM: curbToSec, traverseSeconds: walkSecs(curbToSec), bidirectional: true });
    edges.push({ id: `e-${t.id}-sec-std`, from: secEntryId, to: secExitId, kind: "security_transition", lengthM: 40, traverseSeconds: 10 * 60, bidirectional: false, laneType: "standard" });
    edges.push({ id: `e-${t.id}-sec-pre`, from: secEntryId, to: secExitId, kind: "security_transition", lengthM: 40, traverseSeconds: 5 * 60, bidirectional: false, laneType: "precheck" });
    const secToGate = Math.max(15, metersBetween(t.secExit, t.gate));
    edges.push({ id: `e-${t.id}-sec-gate`, from: secExitId, to: gateId, kind: "walkway", lengthM: secToGate, traverseSeconds: walkSecs(secToGate), bidirectional: true });

    pois.push({ id: `poi-gate-${t.id}`, nodeId: gateId, category: "gate", name: t.gateLabel, precision: "surveyed" });
    pois.push({
      id: `poi-sec-${t.id}`, nodeId: secEntryId, category: "security", name: `${t.name} security`,
      lanes: ["standard", "precheck"],
      notes: "Approximate location — ONT checkpoints are not in OpenStreetMap; the pin is Kepi's best estimate between ticketing and the gates. TSA PreCheck is available.",
    });
    pois.push({ id: `poi-checkin-${t.id}`, nodeId: curbId(t.id), category: "checkin", name: `${t.name} check-in`, precision: "schematic" });
  }

  // Landside frontage walk between the two terminals.
  const t2 = TERMINALS[0], t4 = TERMINALS[1];
  const frontage = metersBetween(t2.curb, t4.curb);
  edges.push({ id: "e-frontage-t2-t4", from: curbId(t2.id), to: curbId(t4.id), kind: "walkway", lengthM: frontage, traverseSeconds: walkSecs(frontage), bidirectional: true });

  // Aspire lounge — real OSM, hung off the Terminal 2 gate cluster (airside).
  nodes.push({ id: "lounge-aspire", pos: ASPIRE, kind: "lounge", airside: true, landmark: "Aspire Airport Lounge (T2)" });
  const aspireLen = Math.max(15, metersBetween([-117.597375, 34.060146], ASPIRE));
  edges.push({ id: "e-gate-t2-aspire", from: "gate-t2", to: "lounge-aspire", kind: "walkway", lengthM: aspireLen, traverseSeconds: walkSecs(aspireLen) + 20, bidirectional: true });
  pois.push({ id: "poi-lounge-aspire", nodeId: "lounge-aspire", category: "lounge", name: "Aspire Airport Lounge (T2)", precision: "surveyed" });

  return { nodes, edges, pois };
}

const BUILT = buildOnt();

const ZONES: TerminalZonePolygon[] = [
  { id: "z-t4", name: "Terminal 4", airside: false, heightM: 12, ring: ONT_OSM_FOOTPRINTS.terminal4 },
  { id: "z-intl", name: "International Arrivals", airside: false, heightM: 12, ring: ONT_OSM_FOOTPRINTS.intlArrivals },
];

export const ONT_LAYOUT: AirportLayout = {
  iata: "ONT",
  name: "Ontario International",
  layoutVersion: "0.1.0-osm-two-terminal",
  updatedAt: "2026-07-15",
  center: [-117.59235, 34.06020],
  zones: ZONES,
  nodes: BUILT.nodes,
  edges: BUILT.edges,
  pois: BUILT.pois,
  gateNodeResolver: [
    { prefix: "2", nodeId: "gate-t2" },
    { prefix: "4", nodeId: "gate-t4" },
  ],
};
