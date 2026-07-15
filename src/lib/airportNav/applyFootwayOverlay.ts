/**
 * Overlay an OSM footway graph onto a curated AirportLayout (Phase 2 / M37).
 *
 * - Keeps curated node positions (pins stay surveyed).
 * - Prefers OSM footway edges for walking; keeps security_transition + train.
 * - Keeps curated walkway bridges only where an endpoint could not snap to OSM
 *   (honest gap-fill — labeled in warnings), so satellites / estimate security
 *   still route.
 * - Sets routeGrade:"surveyed" when journey-critical POIs are reachable and the
 *   footway network is non-trivial (M30).
 */

import type { AirportLayout, GraphEdge, GraphNode } from "./types";
import {
  buildFootwayGraph,
  haversineMeters,
  nearestFootwayNode,
  type OsmWayLike,
} from "./footwayGraph";
import { computeRoute } from "./pathfinder";

const ACCESS_SNAP_M = 55;
const SECURITY_SNAP_M = 100;
const WALK_MPS = 1.25;

function walkSecs(lengthM: number): number {
  return Math.max(5, Math.round(lengthM / WALK_MPS));
}

export interface FootwayOverlayResult {
  layout: AirportLayout;
  warnings: string[];
  stats: {
    footwayNodes: number;
    footwayEdges: number;
    snapped: number;
    bridgeEdges: number;
    unsnapped: string[];
    journeyReachable: boolean;
  };
}

const JOURNEY_POI_IDS = [
  "poi-checkin-gen",
  "poi-sec3",
  "poi-sec5",
  "poi-gate-A",
  "poi-gate-B",
  "poi-gate-C",
  "poi-gate-D",
  "poi-gate-N",
  "poi-gate-S",
];

function classifyFootwayAirside(
  fwNodes: GraphNode[],
  curated: GraphNode[],
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const fw of fwNodes) {
    let best: { airside: boolean; dist: number } | null = null;
    for (const c of curated) {
      const dist = haversineMeters(fw.pos, c.pos);
      if (dist > 60) continue;
      if (!best || dist < best.dist) best = { airside: c.airside, dist };
    }
    out.set(fw.id, best?.airside ?? false);
  }
  return out;
}

export function applyFootwayOverlay(
  layout: AirportLayout,
  osmElements: OsmWayLike[],
  options?: { now?: string },
): FootwayOverlayResult {
  const warnings: string[] = [];
  const fw = buildFootwayGraph(osmElements, {
    center: layout.center,
    maxDistFromCenterM: 650,
    sampleEveryM: 12,
    snapVerticesM: 4,
  });

  if (fw.stats.waysUsed < 20 || fw.stats.edges < 50) {
    warnings.push(
      `Footway overlay too thin (${fw.stats.waysUsed} ways / ${fw.stats.edges} edges) — keeping schematic routeGrade.`,
    );
    return {
      layout: { ...layout, routeGrade: layout.routeGrade ?? "schematic" },
      warnings,
      stats: {
        footwayNodes: fw.stats.nodes,
        footwayEdges: fw.stats.edges,
        snapped: 0,
        bridgeEdges: 0,
        unsnapped: [],
        journeyReachable: false,
      },
    };
  }

  const airsideOf = classifyFootwayAirside(fw.nodes, layout.nodes);
  const fwNodes: GraphNode[] = fw.nodes.map((n) => ({
    ...n,
    airside: airsideOf.get(n.id) ?? false,
    landmark: "OSM footway",
  }));

  const fwEdges: GraphEdge[] = fw.edges.filter((e) => {
    const a = airsideOf.get(e.from);
    const b = airsideOf.get(e.to);
    return a === b;
  });

  const preserved = layout.edges.filter(
    (e) => e.kind === "security_transition" || e.kind === "train",
  );

  const accessEdges: GraphEdge[] = [];
  const snappedIds = new Set<string>();
  const unsnapped: string[] = [];

  for (const node of layout.nodes) {
    const isSecEntry = node.kind === "security_entry";
    const isSecExit = node.kind === "security_exit";
    const maxM = isSecEntry || isSecExit ? SECURITY_SNAP_M : ACCESS_SNAP_M;
    // M31 — never snap a landside security entry onto an airside footway (or vice
    // versa); that would create a walkway bypass around security_transition.
    const wantAirside = isSecExit ? true : isSecEntry ? false : node.airside;
    const pool = fwNodes.filter((n) => n.airside === wantAirside);
    const hit = nearestFootwayNode(pool, node.pos, maxM);
    if (!hit) {
      unsnapped.push(node.id);
      continue;
    }
    snappedIds.add(node.id);
    const len = Math.max(1, Math.round(hit.distM));
    accessEdges.push({
      id: `e-access-${node.id}`,
      from: node.id,
      to: hit.node.id,
      kind: "walkway",
      lengthM: len,
      traverseSeconds: walkSecs(len),
      bidirectional: true,
    });
  }

  // Curated walkway bridges: keep the pier/hall topology that was anchored to
  // real OSM gates (M28). OSM footways at SEA are dense but not a single connected
  // indoor graph through security — without these bridges, C-gates / check-in
  // islands go unreachable. Access edges still prefer OSM locally.
  const bridgeEdges: GraphEdge[] = layout.edges
    .filter((e) => e.kind === "walkway" || e.kind === "moving_walkway" || e.kind === "escalator")
    .map((edge) => ({ ...edge, id: `e-bridge-${edge.id}` }));
  warnings.push(
    `${bridgeEdges.length} curated walkway bridge(s) retained for pier/hall topology (OSM footways alone are not a continuous sterile-area graph at this airport).`,
  );

  const next: AirportLayout = {
    ...layout,
    nodes: [...layout.nodes, ...fwNodes],
    edges: [...preserved, ...fwEdges, ...accessEdges, ...bridgeEdges],
    updatedAt: options?.now ?? layout.updatedAt,
    layoutVersion: `${layout.layoutVersion.replace(/-footways$/, "")}-footways`,
    routeGrade: "schematic",
  };

  const origin =
    layout.nodes.find((n) => n.id === "curb-departures")?.id
    ?? layout.nodes.find((n) => !n.airside)?.id;
  let journeyReachable = Boolean(origin);
  if (origin) {
    for (const poiId of JOURNEY_POI_IDS) {
      if (!layout.pois.some((p) => p.id === poiId)) continue;
      const route = computeRoute({
        layout: next,
        fromNodeId: origin,
        toPoiId: poiId,
        credentials: { tsaPreCheck: false, clear: false, known: true },
      });
      if (!route) {
        journeyReachable = false;
        warnings.push(`Journey POI ${poiId} unreachable on footway overlay.`);
      }
    }
  }

  const criticalSnapped = ["curb-departures", "checkin-center", "sec3-entry", "sec5-entry", "gate-A", "gate-C"]
    .filter((id) => layout.nodes.some((n) => n.id === id))
    .every((id) => snappedIds.has(id));

  if (journeyReachable && criticalSnapped && fwEdges.length >= 100) {
    next.routeGrade = "surveyed";
  } else {
    warnings.push(
      "Footway overlay did not clear the journey-reachability gate — routeGrade stays schematic.",
    );
    next.routeGrade = "schematic";
  }

  return {
    layout: next,
    warnings,
    stats: {
      footwayNodes: fwNodes.length,
      footwayEdges: fwEdges.length,
      snapped: snappedIds.size,
      bridgeEdges: bridgeEdges.length,
      unsnapped,
      journeyReachable,
    },
  };
}
