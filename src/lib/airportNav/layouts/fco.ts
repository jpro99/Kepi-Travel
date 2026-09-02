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
import { FCO_LEONARDO_EXPRESS_RAIL } from "./fcoLeonardoExpressRail";
import {
  buildMultiTerminalSkeleton,
  lerpPos,
  metersBetween,
  schematicZoneRing,
  walkSecs,
} from "../buildMultiTerminalSkeleton";
import { appendFcoT3NumberedCheckinCounters } from "./fcoT3NumberedCheckin";

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

/**
 * International arrivals first mile at T3 (schematic, M30/M32).
 * Flow: E-gate cluster → passport → baggage → customs → arrivals hall → Leonardo.
 * Passport→baggage crosses airside/landside via security_transition (M31), same
 * pattern as LAX TBIT arrivals (2026-08-23).
 */
function appendFcoArrivalFirstMile(
  nodes: GraphNode[],
  edges: GraphEdge[],
  pois: PoiDefinition[],
): void {
  const gateEId = "gate-e";
  const gateEPos: [number, number] = [12.245506, 41.796099]; // surveyed OSM E cluster
  const t3CurbId = "curb-t3";
  const t3CurbPos: [number, number] = [12.250329, 41.795574];

  const passportPos = lerpPos(gateEPos, t3CurbPos, 0.22);
  const baggagePos = lerpPos(gateEPos, t3CurbPos, 0.48);
  const customsPos = lerpPos(gateEPos, t3CurbPos, 0.62);

  nodes.push({
    id: "passport-t3",
    pos: passportPos,
    kind: "customs",
    airside: true,
    landmark: "Passport control — Terminal 3 (Polizia di Frontiera)",
  });
  nodes.push({
    id: "baggage-t3",
    pos: baggagePos,
    kind: "baggage_claim",
    airside: false,
    landmark: "Baggage claim — Terminal 3 arrivals hall",
  });
  nodes.push({
    id: "customs-t3",
    pos: customsPos,
    kind: "customs",
    airside: false,
    landmark: "Customs — green channel / nothing to declare",
  });

  const gateToPassportM = metersBetween(gateEPos, passportPos);
  edges.push({
    id: "e-gate-e-passport",
    from: gateEId,
    to: "passport-t3",
    kind: "walkway",
    lengthM: Math.max(15, gateToPassportM),
    traverseSeconds: walkSecs(Math.max(15, gateToPassportM)),
    bidirectional: false,
  });
  edges.push({
    id: "e-passport-baggage",
    from: "passport-t3",
    to: "baggage-t3",
    kind: "security_transition",
    lengthM: 40,
    traverseSeconds: 12 * 60,
    bidirectional: false,
    laneType: "customs",
  });
  const baggageToCustomsM = metersBetween(baggagePos, customsPos);
  edges.push({
    id: "e-baggage-customs",
    from: "baggage-t3",
    to: "customs-t3",
    kind: "walkway",
    lengthM: Math.max(10, baggageToCustomsM),
    traverseSeconds: walkSecs(Math.max(10, baggageToCustomsM)),
    bidirectional: false,
  });
  const customsToCurbM = metersBetween(customsPos, t3CurbPos);
  edges.push({
    id: "e-customs-curb",
    from: "customs-t3",
    to: t3CurbId,
    kind: "walkway",
    lengthM: Math.max(10, customsToCurbM),
    traverseSeconds: walkSecs(Math.max(10, customsToCurbM)),
    bidirectional: false,
  });

  pois.push({
    id: "poi-passport-t3",
    nodeId: "passport-t3",
    category: "customs",
    name: "Passport control",
    precision: "schematic",
    notes:
      "EU/EEA passport holders use the EU lane; everyone else uses All Passports. Have passport ready — pin is schematic between the E-gate cluster and baggage claim.",
  });
  pois.push({
    id: "poi-baggage-t3",
    nodeId: "baggage-t3",
    category: "baggage",
    name: "Baggage claim — Terminal 3",
    precision: "schematic",
    notes:
      "Follow Baggage Claim / Ritiro bagagli signs. Carousel number is on the overhead screens — Kepi does not invent belt numbers.",
  });
  pois.push({
    id: "poi-customs-t3",
    nodeId: "customs-t3",
    category: "customs",
    name: "Customs → Exit",
    precision: "schematic",
    notes:
      "Declare food/agriculture if required, then follow Exit / Ground Transport signs toward the rail station.",
  });
}

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

  // OSM node 251904108 — Roma Termini (Overpass 2026-08-27); official Leonardo Express terminus
  const terminiPos: [number, number] = [12.5025272, 41.9005815];
  const leonardoToTerminiM = metersBetween(stationPos, terminiPos);

  nodes.push({
    id: "ground-leonardo",
    pos: stationPos,
    kind: "ground_transport",
    airside: false,
    landmark: "Leonardo Express — Fiumicino Aeroporto station",
  });
  nodes.push({
    id: "ground-roma-termini",
    pos: terminiPos,
    kind: "ground_transport",
    airside: false,
    landmark: "Roma Termini",
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

  edges.push({
    id: "e-leonardo-termini",
    from: "ground-leonardo",
    to: "ground-roma-termini",
    kind: "train",
    lengthM: Math.max(1000, leonardoToTerminiM),
    traverseSeconds: 32 * 60,
    bidirectional: false,
  });

  pois.push({
    id: "poi-leonardo-express",
    nodeId: "ground-leonardo",
    category: "train",
    name: "Leonardo Express",
    precision: "surveyed",
    notes:
      "Non-stop ~32 min to Roma Termini (~€14). Buy and tap in at Leonardo gates — one ticket per person. Metrebus / Roma Pass NOT valid. There is no metro from FCO.",
  });
  pois.push({
    id: "poi-roma-termini",
    nodeId: "ground-roma-termini",
    category: "train",
    name: "Roma Termini",
    precision: "surveyed",
    notes:
      "Leonardo Express terminus — non-stop ~32 min from Fiumicino Aeroporto (Trenitalia/FS official service). OSM node 251904108, Overpass 2026-08-27.",
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
appendFcoT3NumberedCheckinCounters({ nodes, edges, pois });
appendFcoArrivalFirstMile(nodes, edges, pois);
appendFcoArrivalsGroundTransport(nodes, edges, pois);

export const FCO_LAYOUT: AirportLayout = {
  iata: "FCO",
  name: "Rome Fiumicino",
  layoutVersion: "0.3.3-t3-numbered-checkin",
  updatedAt: "2026-09-02",
  regionalRailPolylines: [FCO_LEONARDO_EXPRESS_RAIL],
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
