/**
 * Phase 2 — OSM pedestrian ways → walkway graph (KEPI_DESIGN_LAW M30/M37).
 *
 * Builds a routing graph from real `highway=footway|corridor|path|steps|pedestrian`
 * geometry. Airport-agnostic. Does NOT invent corridors — only OSM geometry.
 * Landside↔airside edges are dropped here; callers must keep `security_transition`
 * edges from the curated layout (M31).
 */

import type { GraphEdge, GraphNode } from "./types";

export interface OsmLatLng {
  lat: number;
  lon: number;
}

export interface OsmWayLike {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OsmLatLng[];
}

export interface FootwayBuildOptions {
  /** Keep ways whose midpoint is within this distance of center. */
  maxDistFromCenterM?: number;
  center: [number, number]; // [lng, lat]
  /** Resample dense ways to this spacing (meters). */
  sampleEveryM?: number;
  /** Merge vertices closer than this. */
  snapVerticesM?: number;
}

export interface FootwayGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    waysUsed: number;
    lengthM: number;
    nodes: number;
    edges: number;
  };
}

const PED_HIGHWAY = /^(footway|corridor|path|steps|pedestrian)$/;

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function walkSecs(lengthM: number): number {
  return Math.max(5, Math.round(lengthM / 1.25));
}

function isPedestrianWay(tags: Record<string, string> | undefined): boolean {
  if (!tags?.highway) return false;
  return PED_HIGHWAY.test(tags.highway);
}

/**
 * Build a walkway graph from OSM pedestrian ways near `center`.
 * All nodes are provisional `airside: false` — caller classifies / filters.
 */
export function buildFootwayGraph(
  elements: OsmWayLike[],
  opts: FootwayBuildOptions,
): FootwayGraph {
  const maxDist = opts.maxDistFromCenterM ?? 550;
  const sampleEveryM = opts.sampleEveryM ?? 12;
  const snapM = opts.snapVerticesM ?? 4;
  const [cLng, cLat] = opts.center;

  const ways = elements.filter((el) => {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) return false;
    if (!isPedestrianWay(el.tags)) return false;
    const mid = el.geometry[Math.floor(el.geometry.length / 2)];
    return haversineMeters([cLng, cLat], [mid.lon, mid.lat]) <= maxDist;
  });

  // Collect resampled polylines as sequences of [lng,lat]
  const polylines: Array<{ wayId: number; points: [number, number][]; kind: GraphEdge["kind"] }> = [];
  let lengthM = 0;
  for (const way of ways) {
    const geom = way.geometry!;
    const raw: [number, number][] = geom.map((g) => [g.lon, g.lat]);
    const sampled: [number, number][] = [raw[0]];
    let acc = 0;
    for (let i = 1; i < raw.length; i += 1) {
      const seg = haversineMeters(raw[i - 1], raw[i]);
      lengthM += seg;
      acc += seg;
      if (acc >= sampleEveryM || i === raw.length - 1) {
        sampled.push(raw[i]);
        acc = 0;
      }
    }
    if (sampled.length < 2) continue;
    const kind: GraphEdge["kind"] =
      way.tags?.highway === "steps" ? "escalator" : "walkway";
    polylines.push({ wayId: way.id, points: sampled, kind });
  }

  // Snap vertices into buckets
  type Bucket = { id: string; pos: [number, number] };
  const buckets: Bucket[] = [];
  const keyOf = (p: [number, number]) => {
    // ~snapM grid in degrees (rough; refined by nearest-bucket search)
    const latScale = snapM / 111_320;
    const lngScale = snapM / (111_320 * Math.cos((p[1] * Math.PI) / 180));
    return `${Math.round(p[0] / lngScale)}:${Math.round(p[1] / latScale)}`;
  };
  const bucketByKey = new Map<string, Bucket>();
  let seq = 0;

  function bucketId(pos: [number, number]): string {
    const key = keyOf(pos);
    let b = bucketByKey.get(key);
    if (b) {
      // Prefer closer existing bucket within snapM
      if (haversineMeters(b.pos, pos) <= snapM * 1.5) return b.id;
    }
    // Linear search nearby buckets (small set per cell)
    for (const other of buckets) {
      if (haversineMeters(other.pos, pos) <= snapM) return other.id;
    }
    const id = `fw-${seq++}`;
    b = { id, pos };
    buckets.push(b);
    bucketByKey.set(key, b);
    return id;
  }

  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  for (const line of polylines) {
    const ids = line.points.map((p) => bucketId(p));
    for (let i = 0; i < ids.length - 1; i += 1) {
      const a = ids[i];
      const b = ids[i + 1];
      if (a === b) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      nodeIds.add(a);
      nodeIds.add(b);
      const pa = buckets.find((x) => x.id === a)!.pos;
      const pb = buckets.find((x) => x.id === b)!.pos;
      const len = Math.max(1, Math.round(haversineMeters(pa, pb)));
      edges.push({
        id: `e-fw-${line.wayId}-${i}`,
        from: a,
        to: b,
        kind: line.kind,
        lengthM: len,
        traverseSeconds: walkSecs(len),
        bidirectional: true,
      });
    }
  }

  const nodes: GraphNode[] = buckets
    .filter((b) => nodeIds.has(b.id))
    .map((b) => ({
      id: b.id,
      pos: b.pos,
      kind: "junction" as const,
      airside: false,
      landmark: "OSM footway",
    }));

  return {
    nodes,
    edges,
    stats: {
      waysUsed: ways.length,
      lengthM: Math.round(lengthM),
      nodes: nodes.length,
      edges: edges.length,
    },
  };
}

/** Nearest graph node within maxM, or null. */
export function nearestFootwayNode(
  nodes: GraphNode[],
  pos: [number, number],
  maxM: number,
): { node: GraphNode; distM: number } | null {
  let best: { node: GraphNode; distM: number } | null = null;
  for (const node of nodes) {
    const distM = haversineMeters(pos, node.pos);
    if (distM > maxM) continue;
    if (!best || distM < best.distM) best = { node, distM };
  }
  return best;
}
