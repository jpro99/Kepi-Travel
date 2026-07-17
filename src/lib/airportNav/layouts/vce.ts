/**
 * VCE (Venice Marco Polo) curated layout — Europe trip airport.
 *
 * HONESTY (Overpass around-query 2026-07-17, Map data © OpenStreetMap
 * contributors, ODbL):
 *  - SURVEYED: MAIN + B gate-cluster centroids from OSM aeroway=gate refs.
 *  - SURVEYED curb: OSM "Check-in Banchi 101-139" way/442181037 centroid.
 *  - ESTIMATE: security (M15).
 * Coverage note: OSM gate tagging at VCE is sparse (paired refs like 11-12);
 * clusters are honest aggregates, not every individual gate pin.
 */

import type { AirportLayout } from "../types";
import { buildMultiTerminalSkeleton, schematicZoneRing } from "../buildMultiTerminalSkeleton";

const BUILT = buildMultiTerminalSkeleton({
  securityNote:
    "Approximate location — VCE checkpoints are not in OpenStreetMap; the pin is Kepi's best estimate between check-in and the gates. Follow airport signage.",
  terminals: [
    {
      id: "main",
      name: "Marco Polo terminal",
      curb: [12.340383, 45.503643], // OSM Check-in Banchi 101-139
      curbPrecision: "surveyed",
      gates: [
        { id: "main", label: "Main gates (7–18)", gate: [12.341236, 45.50468], prefix: "1" },
        { id: "b", label: "B gates", gate: [12.341159, 45.505604], prefix: "B" },
      ],
      securityMinutes: { standard: 12, precheck: 6 },
    },
  ],
});

// Also resolve bare numeric gate codes via MAIN cluster (longest-prefix still works for B*).
BUILT.gateNodeResolver.push(
  { prefix: "7", nodeId: "gate-main" },
  { prefix: "8", nodeId: "gate-main" },
  { prefix: "9", nodeId: "gate-main" },
);

export const VCE_LAYOUT: AirportLayout = {
  iata: "VCE",
  name: "Venice Marco Polo",
  layoutVersion: "0.1.0-osm-clusters",
  updatedAt: "2026-07-17",
  center: [12.340607, 45.504481],
  zones: [
    {
      id: "z-main",
      name: "Marco Polo terminal (schematic frame)",
      airside: false,
      heightM: 14,
      ring: schematicZoneRing([
        [12.340383, 45.503643],
        [12.341236, 45.50468],
        [12.341159, 45.505604],
      ]),
    },
  ],
  nodes: BUILT.nodes,
  edges: BUILT.edges,
  pois: BUILT.pois,
  gateNodeResolver: BUILT.gateNodeResolver,
  routeGrade: "schematic",
};
