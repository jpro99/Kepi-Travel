/**
 * FCO Terminal 3 numbered check-in desks on the airport map (M70).
 *
 * Desk numbers follow ADR T3 hall signage (public terminal maps + traveler reports).
 * Positions are SCHEMATIC along the curb → security axis — not surveyed OSM coords.
 * Sources: ADR T3 terminal map (adr.it); TripAdvisor FCO United entrance 410 (2024).
 */

import type { GraphEdge, GraphNode, PoiDefinition } from "../types";
import { lerpPos, metersBetween, walkSecs } from "../buildMultiTerminalSkeleton";

const FCO_T3_CURB: [number, number] = [12.250329, 41.795574];
const FCO_T3_GATE_E: [number, number] = [12.245506, 41.796099];
const FCO_T3_SEC_ENTRY = lerpPos(FCO_T3_CURB, FCO_T3_GATE_E, 0.4);

export type FcoT3DeskSpec = {
  desk: string;
  /** 0 = curb side, 1 = near security */
  alongHall: number;
  name: string;
  airline?: string;
  airlineIataCode?: string;
};

/** Hall markers + United desk 410 (curated; verify assignment on airport screens). */
export const FCO_T3_NUMBERED_DESKS: FcoT3DeskSpec[] = [
  { desk: "401", alongHall: 0.08, name: "Check-in desk 401" },
  { desk: "405", alongHall: 0.16, name: "Check-in desk 405" },
  { desk: "410", alongHall: 0.26, name: "United check-in", airline: "United", airlineIataCode: "UA" },
  { desk: "415", alongHall: 0.34, name: "Check-in desk 415" },
  { desk: "420", alongHall: 0.42, name: "Check-in desk 420" },
  { desk: "196", alongHall: 0.52, name: "Check-in row 196" },
  { desk: "215", alongHall: 0.62, name: "Check-in row 215" },
  { desk: "225", alongHall: 0.72, name: "Check-in row 225" },
];

const COUNTER_NOTES =
  "Desk number from ADR T3 signage; position schematic along ticketing hall. Today's airline assignment may differ — check airport screens.";

export function appendFcoT3NumberedCheckinCounters(input: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  pois: PoiDefinition[];
}): void {
  const curbId = "curb-t3";
  if (!input.nodes.some((node) => node.id === curbId)) return;

  for (const desk of FCO_T3_NUMBERED_DESKS) {
    const nodeId = `checkin-t3-desk-${desk.desk}`;
    const pos = lerpPos(FCO_T3_CURB, FCO_T3_SEC_ENTRY, desk.alongHall);
    input.nodes.push({
      id: nodeId,
      pos,
      kind: "checkin",
      airside: false,
      landmark: `Check-in desk ${desk.desk}`,
    });

    const walkM = Math.max(8, metersBetween(FCO_T3_CURB, pos));
    input.edges.push({
      id: `e-${curbId}-${nodeId}`,
      from: curbId,
      to: nodeId,
      kind: "walkway",
      lengthM: walkM,
      traverseSeconds: walkSecs(walkM),
      bidirectional: true,
    });

    input.pois.push({
      id: `poi-checkin-t3-desk-${desk.desk}`,
      nodeId,
      category: "checkin",
      name: desk.name,
      airline: desk.airline,
      airlineIataCode: desk.airlineIataCode,
      doorLabel: desk.desk,
      minZoomToShow: 13.6,
      precision: "schematic",
      notes: COUNTER_NOTES,
    });
  }
}
