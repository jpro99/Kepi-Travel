/**
 * Phase 1 — OpenStreetMap → Kepi AirportLayout import.
 *
 * Purpose: replace hand-drawn "square box" schematics with the airport's real
 * building shape, for free, using OpenStreetMap. This produces a *draft* only.
 *
 * Honesty rules baked in (see KEPI_DESIGN_LAW M15):
 *  - OSM has rich building outlines, gates, levels and named tenants at hubs,
 *    but NO reliable security-checkpoint tagging (verified 0/0/0 at SEA/LAX/PSP,
 *    2026-07-13). We therefore NEVER fabricate security. Imported drafts carry
 *    `warnings` and must go through admin preview + confirmation before publish.
 *  - The walkway graph OSM exposes is not routable as-is, so we synthesize a
 *    clearly-flagged connectivity skeleton (star graph to a central hub) that a
 *    curator refines. It is enough to render and preview, never enough to trust
 *    blindly for turn-by-turn.
 *  - ODbL: extracting + restructuring OSM into our own routing graph is a
 *    "derivative database", so attribution is mandatory and stored per package.
 */

import type {
  AirportLayout,
  GraphEdge,
  GraphNode,
  PoiDefinition,
  TerminalZonePolygon,
} from "@/lib/airportNav/types";

export const OSM_ATTRIBUTION = "Map data © OpenStreetMap contributors";
export const OSM_LICENSE_NOTE =
  "Derived from OpenStreetMap under ODbL. Kepi restructures OSM geometry into its own routing graph (a derivative database); OSM attribution is required and share-alike applies to the extracted data. Security checkpoints and walkways are Kepi-curated, not copied from any official airport map.";

const DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_USER_AGENT =
  "KepiTravel-airport-map-import/1.0 (+https://kepitravel.com; ops@kepitravel.com)";

/** Airports whose Overpass area-lookup is slow enough to prefer a bbox query. */
const BBOX_OVERRIDES: Record<string, string> = {
  SEA: "47.435,-122.318,47.470,-122.295",
};

export interface OsmLatLng {
  lat: number;
  lon: number;
}

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: OsmLatLng;
  geometry?: OsmLatLng[];
  tags?: Record<string, string>;
}

export interface OsmImportStats {
  zones: number;
  gates: number;
  lounges: number;
  restrooms: number;
  nodes: number;
  edges: number;
  pois: number;
  droppedElements: number;
}

export interface OsmImportResult {
  layout: AirportLayout;
  /** Curation to-dos surfaced to the admin; never auto-resolved. */
  warnings: string[];
  stats: OsmImportStats;
}

/* ── Geometry helpers (lightweight — keep the payload small for mobile) ── */

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function perpendicularDistance(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): number {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const projX = x1 + clamped * dx;
  const projY = y1 + clamped * dy;
  return Math.hypot(x - projX, y - projY);
}

/** Ramer–Douglas–Peucker in lng/lat degrees. Keeps the shape, sheds vertices. */
export function simplifyRing(
  points: [number, number][],
  epsilonDeg = 0.00002,
): [number, number][] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist <= epsilonDeg) {
    return [points[0], points[points.length - 1]];
  }
  const left = simplifyRing(points.slice(0, index + 1), epsilonDeg);
  const right = simplifyRing(points.slice(index), epsilonDeg);
  return [...left.slice(0, -1), ...right];
}

function closeRing(ring: [number, number][]): [number, number][] {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return [...ring, first];
  return ring;
}

function centroid(points: [number, number][]): [number, number] {
  const sum = points.reduce<[number, number]>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1]],
    [0, 0],
  );
  return [sum[0] / points.length, sum[1] / points.length];
}

function ringFromElement(el: OsmElement): [number, number][] | null {
  if (!el.geometry || el.geometry.length < 3) return null;
  return el.geometry.map((g) => [g.lon, g.lat] as [number, number]);
}

function pointFromElement(el: OsmElement): [number, number] | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") return [el.lon, el.lat];
  if (el.center) return [el.center.lon, el.center.lat];
  const ring = ringFromElement(el);
  if (ring) return centroid(ring);
  return null;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

const LOUNGE_NAME = /lounge|sky club|admirals club|united club|centurion|the club|polaris/i;

/* ── Overpass query builder ── */

export function buildAirportImportQuery(iata: string): string {
  const code = iata.trim().toUpperCase();
  const bbox = BBOX_OVERRIDES[code];
  const scope = bbox ? "" : "(area.a)";
  const header = bbox
    ? `[out:json][timeout:120][bbox:${bbox}];`
    : `[out:json][timeout:120];\narea["iata"="${code}"]["aeroway"="aerodrome"]->.a;`;
  return `${header}
(
  way${scope}["aeroway"="terminal"];
  way${scope}["aeroway"="concourse"];
  nwr${scope}["aeroway"="gate"];
  nwr${scope}["amenity"="toilets"];
  nwr${scope}["amenity"="lounge"];
  nwr${scope}["name"~"Lounge|Sky Club|Admirals Club|United Club|Centurion",i];
);
out geom;`;
}

/* ── Conversion: OSM elements → AirportLayout draft ── */

export function convertOsmToLayoutDraft(
  elements: OsmElement[],
  opts: { iata: string; name: string; now?: Date },
): OsmImportResult {
  const iata = opts.iata.trim().toUpperCase();
  const warnings: string[] = [];
  let dropped = 0;

  const zones: TerminalZonePolygon[] = [];
  const usedZoneIds = new Set<string>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const isTerminal = tags.aeroway === "terminal";
    const isConcourse = tags.aeroway === "concourse";
    if (!isTerminal && !isConcourse) continue;
    const ring = ringFromElement(el);
    if (!ring) {
      dropped++;
      continue;
    }
    const simplified = closeRing(simplifyRing(ring));
    if (simplified.length < 4) {
      dropped++;
      continue;
    }
    let id = `zone-${el.type}-${el.id}`;
    while (usedZoneIds.has(id)) id = `${id}-b`;
    usedZoneIds.add(id);
    zones.push({
      id,
      name: tags.name?.trim() || (isConcourse ? "Concourse" : "Terminal"),
      ring: simplified,
      airside: isConcourse,
      heightM: isConcourse ? 10 : 14,
    });
  }

  if (zones.length === 0) {
    throw new Error(
      `No OpenStreetMap terminal/concourse polygons found for ${iata}. Hand-curate this airport instead of importing.`,
    );
  }

  const allZonePoints = zones.flatMap((z) => z.ring);
  const center = centroid(allZonePoints);

  const nodes: GraphNode[] = [];
  const pois: PoiDefinition[] = [];
  const usedNodeIds = new Set<string>();
  const usedPoiIds = new Set<string>();
  let gateCount = 0;
  let loungeCount = 0;
  let restroomCount = 0;

  const hubId = "hub-central";
  nodes.push({
    id: hubId,
    pos: center,
    kind: "junction",
    airside: true,
    landmark: "Central concourse (auto-generated hub — curate real walkways)",
  });
  usedNodeIds.add(hubId);

  const gatePrefixNode = new Map<string, string>();

  for (const el of elements) {
    const tags = el.tags ?? {};
    const pos = pointFromElement(el);
    if (!pos) continue;

    const isGate = tags.aeroway === "gate";
    const isToilet = tags.amenity === "toilets";
    const isLounge = tags.amenity === "lounge" || (tags.name ? LOUNGE_NAME.test(tags.name) : false);
    if (!isGate && !isToilet && !isLounge) continue;

    const baseId = `node-${el.type}-${el.id}`;
    let nodeId = baseId;
    let suffix = 1;
    while (usedNodeIds.has(nodeId)) nodeId = `${baseId}-${suffix++}`;
    usedNodeIds.add(nodeId);

    if (isGate) {
      const ref = (tags.ref || tags.name || "").trim();
      nodes.push({
        id: nodeId,
        pos,
        kind: "gate",
        airside: true,
        landmark: ref ? `Gate ${ref}` : "Gate",
      });
      let poiId = `poi-gate-${slug(ref || String(el.id))}`;
      while (usedPoiIds.has(poiId)) poiId = `${poiId}-b`;
      usedPoiIds.add(poiId);
      pois.push({ id: poiId, nodeId, category: "gate", name: ref ? `Gate ${ref}` : "Gate" });
      gateCount++;
      const prefix = ref.match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
      if (prefix && !gatePrefixNode.has(prefix)) gatePrefixNode.set(prefix, nodeId);
    } else if (isLounge) {
      const name = tags.name?.trim() || "Lounge";
      nodes.push({ id: nodeId, pos, kind: "lounge", airside: true, landmark: name });
      let poiId = `poi-lounge-${slug(name)}`;
      while (usedPoiIds.has(poiId)) poiId = `${poiId}-b`;
      usedPoiIds.add(poiId);
      pois.push({ id: poiId, nodeId, category: "lounge", name });
      loungeCount++;
    } else {
      // toilet
      nodes.push({ id: nodeId, pos, kind: "restroom", airside: true, landmark: "Restrooms" });
      let poiId = `poi-restroom-${el.id}`;
      while (usedPoiIds.has(poiId)) poiId = `${poiId}-b`;
      usedPoiIds.add(poiId);
      pois.push({ id: poiId, nodeId, category: "restroom", name: "Restrooms" });
      restroomCount++;
    }
  }

  if (pois.length === 0) {
    throw new Error(
      `OpenStreetMap had building shapes but no gates/lounges/restrooms for ${iata}. Hand-curate this airport instead of importing.`,
    );
  }

  // Connectivity skeleton: star graph hub → every POI node. Clearly flagged as
  // auto-generated so a curator replaces it with real walkways before publish.
  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    if (node.id === hubId) continue;
    const lengthM = Math.max(5, Math.round(haversineMeters(center, node.pos)));
    edges.push({
      id: `e-hub-${node.id}`,
      from: hubId,
      to: node.id,
      kind: "walkway",
      lengthM,
      traverseSeconds: Math.max(5, Math.round(lengthM / 1.35)),
      bidirectional: true,
    });
  }

  const gateNodeResolver = [...gatePrefixNode.entries()].map(([prefix, nodeId]) => ({
    prefix,
    nodeId,
  }));

  warnings.push(
    "Security checkpoints are not tagged in OpenStreetMap — add real security_entry/exit nodes and lane types before publishing.",
    "Walkways are an auto-generated straight-line skeleton to the terminal centroid — replace with real corridors so routes are trustworthy.",
    "Airside/landside was guessed (concourse=airside, terminal=landside). Verify against the real terminal before publish.",
  );
  if (loungeCount === 0) warnings.push("No lounges detected — add eligibility-relevant lounges if the airport has them.");
  if (gateNodeResolver.length === 0) warnings.push("No gate letter prefixes detected — set gateNodeResolver so gate codes resolve.");

  const layout: AirportLayout = {
    iata,
    name: opts.name.trim() || `${iata} Airport`,
    layoutVersion: "0.1.0-osm-import",
    updatedAt: (opts.now ?? new Date()).toISOString().slice(0, 10),
    center,
    zones,
    nodes,
    edges,
    pois,
    gateNodeResolver,
  };

  return {
    layout,
    warnings,
    stats: {
      zones: zones.length,
      gates: gateCount,
      lounges: loungeCount,
      restrooms: restroomCount,
      nodes: nodes.length,
      edges: edges.length,
      pois: pois.length,
      droppedElements: dropped,
    },
  };
}

/* ── Network fetch (kept separate so conversion stays unit-testable) ── */

export async function fetchAirportOsm(iata: string): Promise<OsmElement[]> {
  const url = process.env.OVERPASS_URL || DEFAULT_OVERPASS_URL;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": OVERPASS_USER_AGENT,
    },
    body: "data=" + encodeURIComponent(buildAirportImportQuery(iata)),
  });
  if (!res.ok) {
    throw new Error(`Overpass request failed for ${iata}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { elements?: OsmElement[] };
  return json.elements ?? [];
}

export async function importAirportFromOsm(
  iata: string,
  name: string,
): Promise<OsmImportResult> {
  const elements = await fetchAirportOsm(iata);
  return convertOsmToLayoutDraft(elements, { iata, name });
}
