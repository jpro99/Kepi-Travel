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
 */

import type { AirportLayout } from "../types";
import { buildMultiTerminalSkeleton, schematicZoneRing } from "../buildMultiTerminalSkeleton";

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

export const FCO_LAYOUT: AirportLayout = {
  iata: "FCO",
  name: "Rome Fiumicino",
  layoutVersion: "0.1.0-osm-t1-t3",
  updatedAt: "2026-07-17",
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
  nodes: BUILT.nodes,
  edges: BUILT.edges,
  pois: BUILT.pois,
  gateNodeResolver: BUILT.gateNodeResolver,
  routeGrade: "schematic",
};
