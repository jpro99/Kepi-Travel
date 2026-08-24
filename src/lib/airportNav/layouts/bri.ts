/**
 * BRI (Bari Karol Wojtyła) curated layout — Europe trip airport.
 *
 * HONESTY (Overpass around-query 2026-07-17, Map data © OpenStreetMap
 * contributors, ODbL):
 *  - SURVEYED: A/B gate-cluster centroids from OSM aeroway=gate (refs in `name`).
 *  - SURVEYED curb: OSM terminal building centroid way/24995995.
 *  - ESTIMATE: security (M15 — no OSM checkpoint tags).
 * routeGrade stays schematic until a footway overlay clears M37.
 */

import type { AirportLayout } from "../types";
import { buildMultiTerminalSkeleton, schematicZoneRing } from "../buildMultiTerminalSkeleton";

const BUILT = buildMultiTerminalSkeleton({
  securityNote:
    "Approximate location — BRI checkpoints are not in OpenStreetMap; the pin is Kepi's best estimate between ticketing and the gates. Follow airport signage.",
  terminals: [
    {
      id: "main",
      name: "Main terminal",
      curb: [16.76418, 41.134554], // OSM way/24995995 centroid
      curbPrecision: "surveyed",
      gates: [
        // OSM gate names A1–A11 cluster (Overpass 2026-07-17)
        { id: "a", label: "A gates", gate: [16.764503, 41.134981], prefix: "A" },
        // OSM gate names B1–B4 cluster
        { id: "b", label: "B gates", gate: [16.762816, 41.134477], prefix: "B" },
      ],
      securityMinutes: { standard: 10, precheck: 5 },
    },
  ],
});

export const BRI_LAYOUT: AirportLayout = {
  iata: "BRI",
  name: "Bari Karol Wojtyła",
  layoutVersion: "0.1.0-osm-clusters",
  updatedAt: "2026-07-17",
  center: [16.764144, 41.134852],
  // Framing ring from surveyed anchors — not a surveyed OSM building outline.
  zones: [
    {
      id: "z-main",
      name: "Main terminal (schematic frame)",
      airside: false,
      heightM: 12,
      ring: schematicZoneRing([
        [16.76418, 41.134554],
        [16.764503, 41.134981],
        [16.762816, 41.134477],
      ]),
    },
  ],
  nodes: BUILT.nodes,
  edges: BUILT.edges,
  pois: BUILT.pois.map((poi) =>
    poi.category === "gate"
      ? {
          ...poi,
          precision: "schematic" as const,
          notes:
            "Gate cluster centroid from OSM — follow signs for your assigned gate (A1–A11 / B1–B4 are text refs, not door pins).",
        }
      : poi,
  ),
  gateNodeResolver: BUILT.gateNodeResolver,
  routeGrade: "schematic",
};
