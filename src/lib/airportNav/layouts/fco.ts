/**
 * FCO (Rome Fiumicino / Leonardo da Vinci) curated layout — Europe trip airport.
 *
 * HONESTY (Overpass around-query 2026-07-17, Map data © OpenStreetMap
 * contributors, ODbL):
 *  - SURVEYED: A + E gate-cluster centroids (28 gates each in OSM).
 *  - SURVEYED curbs: OSM Terminal 1 + Terminal 3 building centroids.
 *  - ESTIMATE: security (M15).
 * COVERAGE GAP: this Overpass pull did not return lettered B/C/D gate refs
 * (common OSM gap at FCO). Those areas are omitted rather than fabricated —
 * use ADR Digiport for full indoor coverage until OSM improves.
 *
 * Arrivals ground transport (2026-08-23): outdoor Leonardo Express station
 * position from OSM node 1313285473 (Fiumicino Aeroporto). No indoor rail
 * graph — schematic walkway from T3 curb only.
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition } from "../types";
import {
  buildMultiTerminalSkeleton,
  metersBetween,
  schematicZoneRing,
  walkSecs,
} from "../buildMultiTerminalSkeleton";

const BUILT = buildMultiTerminalSkeleton({
  securityNote:
    "Approximate location — FCO checkpoints are not in OpenStreetMap; the pin is Kepi's best estimate between ticketing and the gates. Follow airport / ADR Digiport signage.",
  curbChain: ["t1", "t3"],
  terminals: [
    {
      id: "t1",
      name: "Terminal 1",
      curb: [12.255352, 41.79521], // OSM Terminal 1
      curbPrecision: "surveyed",
      gates: [
        { id: "a", label: "A gates (Boarding Area A)", gate: [12.257183, 41.79679], prefix: "A" },
      ],
      securityMinutes: { standard: 15, precheck: 7 },
    },
    {
      id: "t3",
      name: "Terminal 3",
      curb: [12.250329, 41.795574], // OSM Terminal 3
      curbPrecision: "surveyed",
      gates: [
        { id: "e", label: "E gates (Boarding Area E)", gate: [12.245506, 41.796099], prefix: "E" },
      ],
      securityMinutes: { standard: 15, precheck: 7 },
    },
  ],
});

/** Outdoor first-mile targets — no fabricated indoor geometry (M30/M32). */
function appendFcoArrivalsGroundTransport(
  nodes: GraphNode[],
  edges: GraphEdge[],
  pois: PoiDefinition[],
): void {
  const t3CurbId = "curb-t3";
  const t3CurbPos: [number, number] = [12.250329, 41.795574];
  // OSM node 1313285473 — Fiumicino Aeroporto railway station (Nominatim 2026-08-23)
  const stationPos: [number, number] = [12.2518651, 41.7934437];
  const taxiPos: [number, number] = [12.2508, 41.7948];

  nodes.push({
    id: "ground-leonardo",
    pos: stationPos,
    kind: "ground_transport",
    airside: false,
    landmark: "Leonardo Express — Fiumicino Aeroporto station",
  });
  nodes.push({
    id: "ground-taxi-fco",
    pos: taxiPos,
    kind: "ground_transport",
    airside: false,
    landmark: "Official white-taxi rank — T3 arrivals (estimate)",
  });

  const curbToStationM = metersBetween(t3CurbPos, stationPos);
  edges.push({
    id: "e-t3-curb-leonardo",
    from: t3CurbId,
    to: "ground-leonardo",
    kind: "walkway",
    lengthM: Math.max(15, curbToStationM),
    traverseSeconds: Math.max(walkSecs(curbToStationM), 5 * 60),
    bidirectional: true,
  });
  const curbToTaxiM = metersBetween(t3CurbPos, taxiPos);
  edges.push({
    id: "e-t3-curb-taxi",
    from: t3CurbId,
    to: "ground-taxi-fco",
    kind: "walkway",
    lengthM: Math.max(15, curbToTaxiM),
    traverseSeconds: walkSecs(curbToTaxiM),
    bidirectional: true,
  });

  pois.push({
    id: "poi-leonardo-express",
    nodeId: "ground-leonardo",
    category: "train",
    name: "Leonardo Express → Roma Termini",
    precision: "surveyed",
    notes:
      "Non-stop ~32 min to Roma Termini (~€14). Buy and tap in at Leonardo gates — one ticket per person. Metrebus / Roma Pass NOT valid. There is no metro from FCO.",
  });
  pois.push({
    id: "poi-fl1-regional",
    nodeId: "ground-leonardo",
    category: "ground_transport",
    name: "FL1 regional train (not Termini)",
    precision: "surveyed",
    notes:
      "Cheaper FL1 regional line from the same station to Trastevere, Ostiense, or Tiburtina — does NOT go to Roma Termini.",
  });
  pois.push({
    id: "poi-official-taxi-fco",
    nodeId: "ground-taxi-fco",
    category: "ground_transport",
    name: "Official white taxi (€55 fixed)",
    precision: "extrapolated",
    notes:
      "Fixed €55 to anywhere inside the Aurelian Walls. Use only official white taxis at the signed rank.",
  });
}

const nodes = [...BUILT.nodes];
const edges = [...BUILT.edges];
const pois = [...BUILT.pois];
appendFcoArrivalsGroundTransport(nodes, edges, pois);

export const FCO_LAYOUT: AirportLayout = {
  iata: "FCO",
  name: "Rome Fiumicino",
  layoutVersion: "0.2.0-arrivals-ground",
  updatedAt: "2026-08-23",
  center: [12.250152, 41.795211],
  zones: [
    {
      id: "z-t1",
      name: "Terminal 1 (schematic frame)",
      airside: false,
      heightM: 16,
      ring: schematicZoneRing([[12.255352, 41.79521], [12.257183, 41.79679]]),
    },
    {
      id: "z-t3",
      name: "Terminal 3 (schematic frame)",
      airside: false,
      heightM: 16,
      ring: schematicZoneRing([[12.250329, 41.795574], [12.245506, 41.796099]]),
    },
  ],
  nodes,
  edges,
  pois,
  gateNodeResolver: BUILT.gateNodeResolver,
  routeGrade: "schematic",
};
