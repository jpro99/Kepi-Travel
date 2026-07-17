/**
 * MUC (Munich Airport) curated layout — Europe trip airport.
 *
 * HONESTY (Overpass around-query 2026-07-17, Map data © OpenStreetMap
 * contributors, ODbL):
 *  - SURVEYED: gate-cluster centroids A/B/C/D (T1), G/H (T2), K/L/J (T2 Satellite).
 *  - SURVEYED curbs: OSM Terminal 1 + Terminal 2 centroids.
 *  - SURVEYED lounges: named Lufthansa lounge nodes from OSM.
 *  - ESTIMATE: security (M15).
 * Satellite gates are airside-only, reached from T2 by a train (people mover)
 * edge — not a separate landside curb (verify-first).
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition } from "../types";
import {
  buildMultiTerminalSkeleton,
  metersBetween,
  schematicZoneRing,
  walkSecs,
} from "../buildMultiTerminalSkeleton";

const BASE = buildMultiTerminalSkeleton({
  securityNote:
    "Approximate location — MUC checkpoints are not in OpenStreetMap; the pin is Kepi's best estimate between ticketing and the gates. Follow Munich Airport signage.",
  curbChain: ["t1", "t2"],
  terminals: [
    {
      id: "t1",
      name: "Terminal 1",
      curb: [11.781907, 48.353573], // OSM Terminal 1
      curbPrecision: "surveyed",
      gates: [
        { id: "a", label: "A gates", gate: [11.781489, 48.356041], prefix: "A" },
        { id: "b", label: "B gates", gate: [11.7837, 48.35438], prefix: "B" },
        { id: "c", label: "C gates", gate: [11.784061, 48.352432], prefix: "C" },
        { id: "d", label: "D gates", gate: [11.784529, 48.349818], prefix: "D" },
      ],
      securityMinutes: { standard: 14, precheck: 7 },
    },
    {
      id: "t2",
      name: "Terminal 2",
      curb: [11.791344, 48.354214], // OSM Terminal 2
      curbPrecision: "surveyed",
      gates: [
        { id: "g", label: "G gates", gate: [11.79238, 48.353218], prefix: "G" },
        { id: "h", label: "H gates", gate: [11.79241, 48.354333], prefix: "H" },
      ],
      securityMinutes: { standard: 14, precheck: 7 },
    },
  ],
  lounges: [
    { id: "lounge-sen-g", name: "Lufthansa Senator Lounge (T2)", pos: [11.791897, 48.354621], hangOffGateId: "h", airline: "Lufthansa" },
    { id: "lounge-biz-g", name: "Lufthansa Business Class Lounge (T2)", pos: [11.792066, 48.353814], hangOffGateId: "g", airline: "Lufthansa" },
    { id: "lounge-first", name: "First Class Lounge (T2)", pos: [11.792042, 48.354863], hangOffGateId: "h", airline: "Lufthansa" },
  ],
});

const SAT_GATES: Array<{ id: string; label: string; gate: [number, number]; prefix: string }> = [
  { id: "k", label: "K gates (Satellite)", gate: [11.798582, 48.354831], prefix: "K" },
  { id: "l", label: "L gates (Satellite)", gate: [11.798283, 48.354773], prefix: "L" },
  { id: "j", label: "J gates (Satellite)", gate: [11.799458, 48.354616], prefix: "J" },
];

const satNodes: GraphNode[] = [];
const satEdges: GraphEdge[] = [];
const satPois: PoiDefinition[] = [];
const satResolver: NonNullable<AirportLayout["gateNodeResolver"]> = [];

for (const g of SAT_GATES) {
  const gateId = `gate-${g.id}`;
  satNodes.push({ id: gateId, pos: g.gate, kind: "gate", airside: true, landmark: g.label });
  satPois.push({ id: `poi-gate-${g.id}`, nodeId: gateId, category: "gate", name: g.label, precision: "surveyed" });
  satResolver.push({ prefix: g.prefix, nodeId: gateId });
}
for (let i = 0; i < SAT_GATES.length - 1; i += 1) {
  const a = SAT_GATES[i]!;
  const b = SAT_GATES[i + 1]!;
  const len = Math.max(15, metersBetween(a.gate, b.gate));
  satEdges.push({
    id: `e-pier-${a.id}-${b.id}`,
    from: `gate-${a.id}`,
    to: `gate-${b.id}`,
    kind: "walkway",
    lengthM: len,
    traverseSeconds: walkSecs(len),
    bidirectional: true,
  });
}

const hPos: [number, number] = [11.79241, 48.354333];
const kPos = SAT_GATES[0]!.gate;
const trainLen = Math.max(40, metersBetween(hPos, kPos));
satEdges.push({
  id: "e-train-t2-sat",
  from: "gate-h",
  to: "gate-k",
  kind: "train",
  lengthM: trainLen,
  traverseSeconds: walkSecs(trainLen) + 180,
  bidirectional: true,
});

const satLounges: Array<{ id: string; name: string; pos: [number, number]; hang: string }> = [
  { id: "lounge-sen-sat", name: "Lufthansa Senator Lounge (Satellite)", pos: [11.799122, 48.355553], hang: "gate-k" },
  { id: "lounge-biz-sat", name: "Lufthansa Business Class Lounge (Satellite)", pos: [11.799101, 48.355671], hang: "gate-l" },
];
for (const l of satLounges) {
  satNodes.push({ id: l.id, pos: l.pos, kind: "lounge", airside: true, landmark: l.name });
  const anchor = satNodes.find((n) => n.id === l.hang)!;
  const len = Math.max(15, metersBetween(anchor.pos, l.pos));
  satEdges.push({
    id: `e-${l.hang}-${l.id}`,
    from: l.hang,
    to: l.id,
    kind: "walkway",
    lengthM: len,
    traverseSeconds: walkSecs(len) + 30,
    bidirectional: true,
  });
  satPois.push({
    id: `poi-${l.id}`,
    nodeId: l.id,
    category: "lounge",
    name: l.name,
    airline: "Lufthansa",
    precision: "surveyed",
  });
}

export const MUC_LAYOUT: AirportLayout = {
  iata: "MUC",
  name: "Munich Airport",
  layoutVersion: "0.1.0-osm-t1-t2-sat",
  updatedAt: "2026-07-17",
  center: [11.786145, 48.353789],
  zones: [
    {
      id: "z-t1",
      name: "Terminal 1 (schematic frame)",
      airside: false,
      heightM: 16,
      ring: schematicZoneRing([
        [11.781907, 48.353573],
        [11.781489, 48.356041],
        [11.784529, 48.349818],
      ]),
    },
    {
      id: "z-t2",
      name: "Terminal 2 (schematic frame)",
      airside: false,
      heightM: 18,
      ring: schematicZoneRing([
        [11.791344, 48.354214],
        [11.79238, 48.353218],
        [11.79241, 48.354333],
      ]),
    },
    {
      id: "z-sat",
      name: "Terminal 2 Satellite (schematic frame)",
      airside: true,
      heightM: 16,
      ring: schematicZoneRing([
        [11.798582, 48.354831],
        [11.798283, 48.354773],
        [11.799458, 48.354616],
      ]),
    },
  ],
  nodes: [...BASE.nodes, ...satNodes],
  edges: [...BASE.edges, ...satEdges],
  pois: [...BASE.pois, ...satPois],
  gateNodeResolver: [...BASE.gateNodeResolver, ...satResolver],
  routeGrade: "schematic",
};
