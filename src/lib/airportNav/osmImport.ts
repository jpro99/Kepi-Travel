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
import { checkOsmGroundTruth } from "@/lib/airportNav/osmGroundTruth";
import {
  controlPointPoolSupports2dTransform,
  poolControlPointAnchors,
  summarizeControlPointPool,
} from "@/lib/airportNav/controlPointAnchors";
import { findMonotonicityOutliers, type DoorAnchor } from "@/lib/airportNav/doorCurve";

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
  amenities: number;
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

/** Numeric entrance `ref` nodes suitable as doorCurve anchors (M36 input). */
export function doorAnchorsFromOsmElements(elements: OsmElement[]): DoorAnchor[] {
  const out: DoorAnchor[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (!tags.entrance) continue;
    const ref = tags.ref?.trim();
    if (!ref || !/^\d+$/.test(ref)) continue;
    const pos = pointFromElement(el);
    if (!pos) continue;
    out.push({ door: Number(ref), lng: pos[0], lat: pos[1] });
  }
  return out;
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
  nwr${scope}["entrance"];
  nwr${scope}["amenity"="toilets"];
  nwr${scope}["amenity"="lounge"];
  nwr${scope}["name"~"Lounge|Sky Club|Admirals Club|United Club|Centurion",i];
  nwr${scope}["amenity"~"restaurant|cafe|fast_food|bar|food_court|bank|atm|charging_station|bureau_de_change|drinking_water|baggage_claim",i];
  nwr${scope}["shop"];
  nwr${scope}["highway"="elevator"];
  nwr${scope}["highway"="steps"]["conveying"];
  way${scope}["highway"];
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
  let amenityCount = 0;

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

  const FOOD_AMENITY = /^(restaurant|cafe|fast_food|bar|food_court|pub|ice_cream)$/;
  const TRAVELER_AMENITY = /^(bank|atm|charging_station|bureau_de_change|drinking_water|baggage_claim)$/;

  for (const el of elements) {
    const tags = el.tags ?? {};
    const pos = pointFromElement(el);
    if (!pos) continue;

    const isGate = tags.aeroway === "gate";
    const isToilet = tags.amenity === "toilets";
    const isLounge = tags.amenity === "lounge" || (tags.name ? LOUNGE_NAME.test(tags.name) : false);
    const isElevator = tags.highway === "elevator" || tags.elevator === "yes";
    const isEscalator =
      tags.highway === "steps" &&
      (tags.conveying === "yes" || tags.conveying === "forward" || tags.conveying === "backward");
    const isShop = Boolean(tags.shop) && Boolean(tags.name?.trim());
    const isFood = Boolean(tags.amenity && FOOD_AMENITY.test(tags.amenity) && tags.name?.trim());
    const isTravelerAmenity = Boolean(tags.amenity && TRAVELER_AMENITY.test(tags.amenity));
    // Skip unnamed food/shop — promote only real named tagged features (master prompt §3).
    if (!isGate && !isToilet && !isLounge && !isElevator && !isEscalator && !isShop && !isFood && !isTravelerAmenity) {
      continue;
    }

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
      pois.push({
        id: poiId,
        nodeId,
        category: "gate",
        name: ref ? `Gate ${ref}` : "Gate",
        precision: "surveyed",
      });
      gateCount++;
      const prefix = ref.match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
      if (prefix && !gatePrefixNode.has(prefix)) gatePrefixNode.set(prefix, nodeId);
    } else if (isLounge) {
      const name = tags.name?.trim() || "Lounge";
      nodes.push({ id: nodeId, pos, kind: "lounge", airside: true, landmark: name });
      let poiId = `poi-lounge-${slug(name)}`;
      while (usedPoiIds.has(poiId)) poiId = `${poiId}-b`;
      usedPoiIds.add(poiId);
      pois.push({ id: poiId, nodeId, category: "lounge", name, precision: "surveyed" });
      loungeCount++;
    } else if (isToilet) {
      nodes.push({ id: nodeId, pos, kind: "restroom", airside: true, landmark: "Restrooms" });
      let poiId = `poi-restroom-${el.id}`;
      while (usedPoiIds.has(poiId)) poiId = `${poiId}-b`;
      usedPoiIds.add(poiId);
      pois.push({ id: poiId, nodeId, category: "restroom", name: "Restrooms", precision: "surveyed" });
      restroomCount++;
    } else {
      // Named shop / food / bank / ATM / elevator / escalator / charging — exact OSM coord.
      const name =
        tags.name?.trim() ||
        (isElevator ? "Elevator" : isEscalator ? "Escalator" : tags.amenity?.replace(/_/g, " ") || "Amenity");
      nodes.push({ id: nodeId, pos, kind: "landmark", airside: true, landmark: name });
      let poiId = `poi-amenity-${slug(name)}-${el.id}`;
      while (usedPoiIds.has(poiId)) poiId = `${poiId}-b`;
      usedPoiIds.add(poiId);
      pois.push({
        id: poiId,
        nodeId,
        category: tags.amenity === "baggage_claim" ? "baggage" : "amenity",
        name: name.replace(/\b\w/g, (c) => c.toUpperCase()),
        precision: "surveyed",
      });
      amenityCount++;
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

  // Control-point pool: tell the curator whether 2D georeferencing is viable yet.
  const controlAnchors = poolControlPointAnchors(elements);
  const poolSummary = summarizeControlPointPool(controlAnchors);
  if (controlPointPoolSupports2dTransform(controlAnchors)) {
    warnings.push(
      `Control-point pool ready for 2D draft georeferencing (${controlAnchors.length} anchors: ` +
        `doors ${poolSummary.door}, gates ${poolSummary.gate}, lounges ${poolSummary.lounge}, ` +
        `elevators ${poolSummary.elevator}, escalators ${poolSummary.escalator}, amenities ${poolSummary.amenity}). ` +
        `Estimates stay schematic until human click-to-place confirmation.`,
    );
  } else {
    warnings.push(
      `Control-point pool is thin for 2D georeferencing (${controlAnchors.length} anchors across ` +
        `${Object.values(poolSummary).filter((n) => n > 0).length} kinds) — door-row curve interpolation ` +
        `is still fine; pool more gates/elevators before trusting depth into the terminal.`,
    );
  }

  // M36 — entrance refs that break facade monotonicity poison doorCurve anchors.
  const doorAnchors = doorAnchorsFromOsmElements(elements);
  const doorOutliers = findMonotonicityOutliers(doorAnchors);
  for (const outlier of doorOutliers) {
    warnings.push(
      `Door ref ${outlier.door} breaks monotonic order with its neighbors — likely mis-tagged, exclude before using as a curve anchor (M36).`,
    );
  }

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

  // KEPI_DESIGN_LAW M33 — run the ground-truth conformance gate against the OSM we
  // just fetched. Drafts stay rough (nothing auto-publishes), so these surface as
  // curation to-dos, with hard conformance failures marked as must-fix.
  const groundTruth = checkOsmGroundTruth(layout, elements);
  for (const e of groundTruth.errors) warnings.push(`GROUND-TRUTH (fix before publish): ${e}`);
  for (const w of groundTruth.warnings) warnings.push(`GROUND-TRUTH: ${w}`);

  return {
    layout,
    warnings,
    stats: {
      zones: zones.length,
      gates: gateCount,
      lounges: loungeCount,
      restrooms: restroomCount,
      amenities: amenityCount,
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
