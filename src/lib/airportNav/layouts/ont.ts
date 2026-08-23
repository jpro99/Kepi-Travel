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
 *  - ESTIMATE (Kepi-curated, labeled): curbs, check-in counters, and security
 *    checkpoints. Terminal 4's curb uses its real OSM building centroid; Terminal
 *    2 has NO OSM building polygon, so its curb is estimated ~60 m north of the
 *    gate line. OSM has no check-in or checkpoint tagging (M15) — those pins are
 *    interpolated curb→gate.
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition, TerminalZonePolygon } from "../types";
import { lerpPos, metersBetween, walkSecs } from "../buildMultiTerminalSkeleton";
import { ONT_OSM_FOOTPRINTS } from "./ontFootprints";

interface TerminalSpec {
  id: string;
  name: string;
  gateLabel: string;
  curb: [number, number];
  secEntry: [number, number];
  secExit: [number, number];
  gate: [number, number]; // SURVEYED — real OSM gate-cluster centroid
  /** Primary carriers at this terminal (honest ops reference, not exhaustive). */
  airlines?: string[];
}

const TERMINALS: TerminalSpec[] = [
  // Terminal 2 — curb ESTIMATE (~60 m north of gates; no OSM building polygon).
  {
    id: "t2",
    name: "Terminal 2",
    gateLabel: "Terminal 2 gates (201–213)",
    curb: [-117.597375, 34.060686],
    secEntry: [-117.597375, 34.060470],
    secExit: [-117.597375, 34.060308],
    gate: [-117.597375, 34.060146],
    airlines: ["Alaska", "Southwest", "American", "Delta"],
  },
  // Terminal 4 — curb = real OSM building centroid.
  {
    id: "t4",
    name: "Terminal 4",
    gateLabel: "Terminal 4 gates (401–414)",
    curb: [-117.588100, 34.060290],
    secEntry: [-117.587794, 34.060237],
    secExit: [-117.587642, 34.060211],
    gate: [-117.587336, 34.060158],
  },
];

// Aspire Airport Lounge — real OSM coordinate (SURVEYED), Terminal 2 airside.
const ASPIRE: [number, number] = [-117.596516, 34.060242];

function buildOnt(): { nodes: GraphNode[]; edges: GraphEdge[]; pois: PoiDefinition[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const pois: PoiDefinition[] = [];
  const curbId = (t: string) => `curb-${t}`;
  const checkinId = (t: string) => `checkin-${t}`;

  for (const t of TERMINALS) {
    const secEntryId = `sec-${t.id}-entry`;
    const secExitId = `sec-${t.id}-exit`;
    const gateId = `gate-${t.id}`;
    const checkinPos = lerpPos(t.curb, t.secEntry, 0.35);

    nodes.push({
      id: curbId(t.id),
      pos: t.curb,
      kind: "junction",
      airside: false,
      landmark: `${t.name} — departures curb (drop-off)`,
    });
    nodes.push({
      id: checkinId(t.id),
      pos: checkinPos,
      kind: "checkin",
      airside: false,
      landmark: `${t.name} check-in & bag drop`,
    });
    nodes.push({
      id: secEntryId,
      pos: t.secEntry,
      kind: "security_entry",
      airside: false,
      landmark: `${t.name} security checkpoint`,
    });
    nodes.push({
      id: secExitId,
      pos: t.secExit,
      kind: "security_exit",
      airside: true,
      landmark: `${t.name} — past security`,
    });
    nodes.push({
      id: gateId,
      pos: t.gate,
      kind: "gate",
      airside: true,
      landmark: t.gateLabel,
    });

    const curbToCheckin = Math.max(10, metersBetween(t.curb, checkinPos));
    edges.push({
      id: `e-${t.id}-curb-checkin`,
      from: curbId(t.id),
      to: checkinId(t.id),
      kind: "walkway",
      lengthM: curbToCheckin,
      traverseSeconds: walkSecs(curbToCheckin),
      bidirectional: true,
    });
    const checkinToSec = Math.max(10, metersBetween(checkinPos, t.secEntry));
    edges.push({
      id: `e-${t.id}-checkin-sec`,
      from: checkinId(t.id),
      to: secEntryId,
      kind: "walkway",
      lengthM: checkinToSec,
      traverseSeconds: walkSecs(checkinToSec),
      bidirectional: true,
    });
    edges.push({
      id: `e-${t.id}-sec-std`,
      from: secEntryId,
      to: secExitId,
      kind: "security_transition",
      lengthM: 40,
      traverseSeconds: 10 * 60,
      bidirectional: false,
      laneType: "standard",
    });
    edges.push({
      id: `e-${t.id}-sec-pre`,
      from: secEntryId,
      to: secExitId,
      kind: "security_transition",
      lengthM: 40,
      traverseSeconds: 5 * 60,
      bidirectional: false,
      laneType: "precheck",
    });
    const secToGate = Math.max(15, metersBetween(t.secExit, t.gate));
    edges.push({
      id: `e-${t.id}-sec-gate`,
      from: secExitId,
      to: gateId,
      kind: "walkway",
      lengthM: secToGate,
      traverseSeconds: walkSecs(secToGate),
      bidirectional: true,
    });

    pois.push({
      id: `poi-dropoff-${t.id}`,
      nodeId: curbId(t.id),
      category: "checkin",
      name: `${t.name} drop-off`,
      precision: "schematic",
    });
    pois.push({
      id: `poi-gate-${t.id}`,
      nodeId: gateId,
      category: "gate",
      name: t.gateLabel,
      precision: "surveyed",
    });
    pois.push({
      id: `poi-sec-${t.id}`,
      nodeId: secEntryId,
      category: "security",
      name: `${t.name} security`,
      lanes: ["standard", "precheck"],
      notes:
        "Approximate location — ONT checkpoints are not in OpenStreetMap; the pin is Kepi's best estimate between ticketing and the gates. TSA PreCheck is available.",
    });

    const primaryAirline = t.airlines?.[0];
    pois.push({
      id: `poi-checkin-${t.id}`,
      nodeId: checkinId(t.id),
      category: "checkin",
      name: primaryAirline ? `${primaryAirline} · ${t.name} check-in` : `${t.name} check-in`,
      airline: primaryAirline,
      precision: "schematic",
      notes:
        t.id === "t2"
          ? "Alaska, Southwest, American, and Delta depart from Terminal 2 — follow posted airline signs."
          : undefined,
    });
  }

  // Landside frontage walk between the two terminals.
  const t2 = TERMINALS[0]!;
  const t4 = TERMINALS[1]!;
  const frontage = metersBetween(t2.curb, t4.curb);
  edges.push({
    id: "e-frontage-t2-t4",
    from: curbId(t2.id),
    to: curbId(t4.id),
    kind: "walkway",
    lengthM: frontage,
    traverseSeconds: walkSecs(frontage),
    bidirectional: true,
  });

  // Aspire lounge — real OSM, hung off the Terminal 2 gate cluster (airside).
  nodes.push({
    id: "lounge-aspire",
    pos: ASPIRE,
    kind: "lounge",
    airside: true,
    landmark: "Aspire Airport Lounge (T2)",
  });
  const aspireLen = Math.max(15, metersBetween(t2.gate, ASPIRE));
  edges.push({
    id: "e-gate-t2-aspire",
    from: "gate-t2",
    to: "lounge-aspire",
    kind: "walkway",
    lengthM: aspireLen,
    traverseSeconds: walkSecs(aspireLen) + 20,
    bidirectional: true,
  });
  pois.push({
    id: "poi-lounge-aspire",
    nodeId: "lounge-aspire",
    category: "lounge",
    name: "Aspire Airport Lounge (T2)",
    precision: "surveyed",
  });

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
  layoutVersion: "0.2.0-depart-first-mile",
  updatedAt: "2026-08-23",
  center: [-117.59235, 34.06020],
  routeGrade: "schematic",
  zones: ZONES,
  nodes: BUILT.nodes,
  edges: BUILT.edges,
  pois: BUILT.pois,
  gateNodeResolver: [
    { prefix: "2", nodeId: "gate-t2" },
    { prefix: "4", nodeId: "gate-t4" },
  ],
};
