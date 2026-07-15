/**
 * SEA ticketing-hall — generated door/airline POIs (KEPI_DESIGN_LAW M26/M27).
 *
 * Door POSITIONS are curve-calibrated (`doorCurve.ts`) from REAL OSM entrance
 * `ref` nodes (Overpass/OSM API map extract, re-matched 2026-07-15). Odd door
 * numbers have no OSM entrance tag at SEA — they stay schematic/extrapolated.
 *
 * Airline → door ASSIGNMENTS cross-checked 2026-07-15 against Port of Seattle
 * Web-Ticketing_4.16.25.pdf (zone clusters, not exact door numbers). Icelandair
 * sits with the United/Emirates/Air Canada cluster (Door 7), not Door 17.
 * Southwest is not listed on that PDF — Door 17 WN is an ESTIMATE pending
 * live signage confirmation. Treat door numbers within a cluster as approximate.
 *
 * Amenities use REAL OSM indoor coordinates (Overpass, verified 2026-07-14).
 */

import type { GraphEdge, GraphNode, PoiDefinition } from "../types";
import { interpolateDoorPosition, type DoorAnchor } from "../doorCurve";

/**
 * REAL OSM entrance `ref` nodes — south→north door numbers that also increase
 * geographically (mis-tagged OSM refs 6/16/18/24 skipped — they break monotonic
 * order). Source: OSM API map extract 2026-07-15.
 *   Door 4  node/12103438752
 *   Door 12 node/11108219153
 *   Door 14 node/3732079295
 *   Door 20 node/11108219159
 *   Door 22 node/11108219161
 */
export const SEA_DOOR_ANCHORS: DoorAnchor[] = [
  { door: 4, lng: -122.300257, lat: 47.4422245 },
  { door: 12, lng: -122.3012498, lat: 47.4429006 },
  { door: 14, lng: -122.301817, lat: 47.4432645 },
  { door: 20, lng: -122.3014823, lat: 47.444138 },
  { door: 22, lng: -122.3008676, lat: 47.4444743 },
];

// The interior hall node door edges connect to (mirrors sea.ts `landside-hall`).
const HALL_NODE_ID = "landside-hall";
const HALL_POS: [number, number] = [-122.302000, 47.443400];

interface DoorAirlines {
  door: number;
  /** Reuse an existing sea.ts node (a surveyed anchor already wired) instead of a new one. */
  existingNodeId?: string;
  airlines: { name: string; iata: string }[];
}

// Zone clusters from Port of Seattle Web-Ticketing_4.16.25.pdf (2026-07-15).
// Ordered south→north. Exact door numbers within a zone are approximate.
const DOOR_AIRLINES: DoorAirlines[] = [
  { door: 3, airlines: [
    { name: "Finnair", iata: "AY" }, { name: "Turkish Airlines", iata: "TK" },
    { name: "Asiana", iata: "OZ" }, { name: "Philippine Airlines", iata: "PR" },
  ] },
  { door: 5, airlines: [
    { name: "British Airways", iata: "BA" }, { name: "Aer Lingus", iata: "EI" },
    { name: "Lufthansa", iata: "LH" }, { name: "ANA", iata: "NH" }, { name: "Hainan Airlines", iata: "HU" },
  ] },
  { door: 7, airlines: [
    { name: "United", iata: "UA" }, { name: "Emirates", iata: "EK" }, { name: "Air Canada", iata: "AC" },
    { name: "STARLUX", iata: "JX" }, { name: "JetBlue", iata: "B6" },
    { name: "Icelandair", iata: "FI" },
  ] },
  { door: 13, airlines: [
    { name: "Delta", iata: "DL" }, { name: "Air France", iata: "AF" }, { name: "Aeromexico", iata: "AM" },
    { name: "WestJet", iata: "WS" }, { name: "SAS", iata: "SK" },
  ] },
  // ESTIMATE — Southwest Airlines is not on Port Web-Ticketing_4.16.25.pdf (Apr 2025).
  // Leave schematic until live ticketing signage confirms a door.
  { door: 17, airlines: [
    { name: "Southwest", iata: "WN" },
  ] },
  { door: 21, airlines: [
    { name: "Frontier", iata: "F9" }, { name: "Sun Country", iata: "SY" }, { name: "American", iata: "AA" },
  ] },
  // Alaska — north end on surveyed OSM Door 22 (node/11108219161). OSM has no
  // trustworthy north Door 24 entrance (ref=24 is mid-facade / mis-ordered).
  { door: 22, existingNodeId: "checkin-north", airlines: [{ name: "Alaska", iata: "AS" }] },
];

// Named amenities — REAL OSM indoor coordinates (Overpass, verified 2026-07-14).
interface AmenitySpec {
  id: string;
  name: string;
  lng: number;
  lat: number;
}
const AMENITIES: AmenitySpec[] = [
  { id: "amenity-play", name: "Children's Play Area", lng: -122.302215, lat: 47.442876 },
  { id: "amenity-lucky-louie", name: "Lucky Louie Fish Shack", lng: -122.303169, lat: 47.443281 },
  { id: "amenity-floret", name: "Floret", lng: -122.302228, lat: 47.442631 },
  { id: "amenity-mcdonalds", name: "McDonald's", lng: -122.302830, lat: 47.442660 },
  { id: "amenity-qdoba", name: "Qdoba", lng: -122.302379, lat: 47.443014 },
  { id: "amenity-saltys", name: "Salty's at the SEA", lng: -122.303263, lat: 47.443954 },
];

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface SeaTicketingHall {
  nodes: GraphNode[];
  edges: GraphEdge[];
  pois: PoiDefinition[];
}

export function buildSeaTicketingHall(): SeaTicketingHall {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const pois: PoiDefinition[] = [];

  for (const entry of DOOR_AIRLINES) {
    const { pos, grade } = interpolateDoorPosition(SEA_DOOR_ANCHORS, entry.door);
    let nodeId = entry.existingNodeId;
    if (!nodeId) {
      nodeId = `checkin-door-${entry.door}`;
      nodes.push({
        id: nodeId,
        pos,
        kind: "checkin",
        airside: false,
        landmark: `Ticketing — Door ${entry.door}`,
      });
      const len = Math.max(10, Math.round(haversineM(pos, HALL_POS)));
      edges.push({
        id: `e-${nodeId}-hall`,
        from: nodeId,
        to: HALL_NODE_ID,
        kind: "walkway",
        lengthM: len,
        traverseSeconds: Math.round(len / 1.25),
        bidirectional: true,
      });
    }
    for (const airline of entry.airlines) {
      pois.push({
        id: `poi-checkin-${airline.iata.toLowerCase()}`,
        nodeId,
        category: "checkin",
        name: `${airline.name} check-in`,
        airline: airline.name,
        airlineIataCode: airline.iata,
        doorLabel: `Door ${entry.door}`,
        minZoomToShow: 15,
        precision: grade,
      });
    }
  }

  for (const a of AMENITIES) {
    nodes.push({ id: a.id, pos: [a.lng, a.lat], kind: "landmark", airside: true, landmark: a.name });
    pois.push({
      id: `poi-${a.id}`,
      nodeId: a.id,
      category: "amenity",
      name: a.name,
      minZoomToShow: 15.5,
      precision: "surveyed",
    });
  }

  return { nodes, edges, pois };
}
