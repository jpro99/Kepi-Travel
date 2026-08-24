/**
 * KAC compiler JSON → valid AirportLayoutPackage.
 *
 * Fills missing edge metrics (lengthM, traverseSeconds, bidirectional), strips
 * compiler-only keys, and synthesizes POIs + gateNodeResolver. Does not invent
 * indoor routes beyond what the compiler emitted.
 */

import {
  parseAirportLayoutPackage,
  type AirportLayoutPackage,
  type AirportLayoutPackageSource,
} from "../airportLayoutPackage";
import { haversineMeters } from "../footwayGraph";
import type {
  AirportLayout,
  GraphEdge,
  GraphNode,
  PoiCategory,
  PoiDefinition,
} from "../types";
import type { KacCompilerEdge, KacCompilerLayout, KacCompilerNode, KacCompilerPackage } from "./types";

const WALK_MPS = 1.25;

const DEFAULT_KAC_SOURCE: AirportLayoutPackageSource = {
  ownership: "kepi_original",
  attribution: "KAC compiler draft — OpenStreetMap contributors (ODbL)",
  sourceUrls: ["https://www.openstreetmap.org"],
  licenseNote:
    "Schematic draft only — pins are approximate. Follow airport signage; no indoor turn-by-turn.",
  lastVerifiedAt: "2026-08-23",
};

function walkSecs(lengthM: number): number {
  return Math.max(5, Math.round(lengthM / WALK_MPS));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Cartographer drafts sometimes emit layoutVersion strings in revision. */
function coerceKacRevision(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return 1;
}

/** Zod expects full ISO datetimes; KAC exports may be date-only or offset-local. */
function coerceKacIsoDatetime(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return fallback;
  return new Date(ms).toISOString();
}

function stripLayoutExtras(layout: KacCompilerLayout): Pick<
  KacCompilerLayout,
  "iata" | "name" | "layoutVersion" | "updatedAt" | "center" | "zones"
> {
  return {
    iata: layout.iata,
    name: layout.name,
    layoutVersion: layout.layoutVersion,
    updatedAt: layout.updatedAt,
    center: layout.center,
    zones: layout.zones,
  };
}

function normalizeNode(raw: KacCompilerNode): { node: GraphNode; meta: { name?: string; precision?: PoiDefinition["precision"]; doorLabel?: string } } {
  const landmark = typeof raw.name === "string" ? raw.name.trim() : undefined;
  const node: GraphNode = {
    id: raw.id,
    pos: raw.pos,
    kind: raw.kind,
    airside: raw.airside,
    ...(landmark ? { landmark } : {}),
  };
  return {
    node,
    meta: {
      name: landmark,
      precision: raw.precision,
      doorLabel: typeof raw.doorLabel === "string" ? raw.doorLabel.trim() : undefined,
    },
  };
}

function poiCategoryForNode(kind: GraphNode["kind"]): PoiCategory {
  switch (kind) {
    case "gate":
      return "gate";
    case "baggage_claim":
      return "baggage";
    case "ground_transport":
      return "train";
    case "customs":
      return "customs";
    case "door":
      return "ground_transport";
    default:
      return "amenity";
  }
}

function buildPoiFromNode(
  node: GraphNode,
  meta: { name?: string; precision?: PoiDefinition["precision"]; doorLabel?: string },
): PoiDefinition {
  const name = meta.name ?? node.landmark ?? node.id;
  const category = poiCategoryForNode(node.kind);
  const precision = meta.precision ?? "schematic";
  const notes =
    node.kind === "gate"
      ? "Approximate gate position from OSM door-ref — follow signs; no indoor route."
      : "Approximate pin — follow airport signage.";

  return {
    id: `poi:${node.id}`,
    nodeId: node.id,
    category,
    name,
    precision,
    notes,
    ...(meta.doorLabel ? { doorLabel: meta.doorLabel } : {}),
    ...(node.kind === "gate" ? { minZoomToShow: 17 } : {}),
  };
}

function completeEdge(
  edge: KacCompilerEdge,
  nodeById: Map<string, GraphNode>,
): GraphEdge {
  const fromNode = nodeById.get(edge.from);
  const toNode = nodeById.get(edge.to);
  if (!fromNode || !toNode) {
    throw new Error(`KAC edge ${edge.id} references unknown node(s): ${edge.from} → ${edge.to}`);
  }

  const lengthM =
    typeof edge.lengthM === "number" && Number.isFinite(edge.lengthM) && edge.lengthM > 0
      ? edge.lengthM
      : Math.max(5, Math.round(haversineMeters(fromNode.pos, toNode.pos)));

  const traverseSeconds =
    typeof edge.traverseSeconds === "number" && Number.isFinite(edge.traverseSeconds) && edge.traverseSeconds > 0
      ? edge.traverseSeconds
      : walkSecs(lengthM);

  const bidirectional = typeof edge.bidirectional === "boolean" ? edge.bidirectional : true;

  const completed: GraphEdge = {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    kind: edge.kind,
    lengthM,
    traverseSeconds,
    bidirectional,
  };

  if (edge.kind === "security_transition" && typeof edge.laneType === "string") {
    completed.laneType = edge.laneType as GraphEdge["laneType"];
  }

  return completed;
}

function buildGateNodeResolver(nodes: GraphNode[], rawNodes: KacCompilerNode[]): AirportLayout["gateNodeResolver"] {
  const byId = new Map(rawNodes.map((n) => [n.id, n]));
  const resolver: AirportLayout["gateNodeResolver"] = [];

  for (const node of nodes) {
    if (node.kind !== "gate") continue;
    const raw = byId.get(node.id);
    const label = raw?.doorLabel?.trim();
    if (label) {
      resolver.push({ prefix: label.toUpperCase(), nodeId: node.id });
    }
  }

  // Longest-prefix-first for resolveGateNode consumers.
  resolver.sort((a, b) => b.prefix.length - a.prefix.length);
  return resolver;
}

function mergeGateResolverEntries(
  fromLabels: AirportLayout["gateNodeResolver"],
  fromCompiler: AirportLayout["gateNodeResolver"] | undefined,
): AirportLayout["gateNodeResolver"] {
  const byPrefix = new Map<string, { prefix: string; nodeId: string }>();
  for (const entry of fromCompiler ?? []) {
    byPrefix.set(entry.prefix.toUpperCase(), { prefix: entry.prefix, nodeId: entry.nodeId });
  }
  for (const entry of fromLabels) {
    const key = entry.prefix.toUpperCase();
    if (!byPrefix.has(key)) byPrefix.set(key, entry);
  }
  return [...byPrefix.values()].sort((a, b) => b.prefix.length - a.prefix.length);
}

function adaptLayout(rawLayout: KacCompilerLayout): AirportLayout {
  const shell = stripLayoutExtras(rawLayout);
  const normalized = rawLayout.nodes.map(normalizeNode);
  const nodes = normalized.map((n) => n.node);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const edges = rawLayout.edges.map((edge) => completeEdge(edge, nodeById));
  const pois = normalized.map(({ node, meta }) => buildPoiFromNode(node, meta));
  const gateNodeResolver = mergeGateResolverEntries(
    buildGateNodeResolver(nodes, rawLayout.nodes),
    rawLayout.gateNodeResolver,
  );

  return {
    iata: shell.iata,
    name: shell.name,
    layoutVersion: shell.layoutVersion,
    updatedAt: shell.updatedAt,
    center: shell.center,
    zones: shell.zones,
    nodes,
    edges,
    pois,
    gateNodeResolver,
    routeGrade: rawLayout.routeGrade ?? "schematic",
  };
}

/**
 * Adapt a KAC compiler package JSON object into a Zod-valid AirportLayoutPackage.
 */
export function adaptKacCompilerJson(raw: unknown): AirportLayoutPackage {
  if (!isRecord(raw)) throw new Error("KAC compiler JSON must be an object");
  const pkg = raw as KacCompilerPackage;

  if (pkg.schemaVersion !== 1) {
    throw new Error(`Unsupported KAC schemaVersion: ${String(pkg.schemaVersion)}`);
  }
  if (!isRecord(pkg.layout)) {
    throw new Error("KAC package missing layout object");
  }

  const layout = adaptLayout(pkg.layout as KacCompilerLayout);
  const source = pkg.source ?? DEFAULT_KAC_SOURCE;
  const layoutUpdatedAt = coerceKacIsoDatetime(
    (pkg.layout as KacCompilerLayout).updatedAt,
    "2026-08-23T00:00:00.000Z",
  );
  const createdAt = coerceKacIsoDatetime(pkg.createdAt, layoutUpdatedAt);
  const updatedAt = coerceKacIsoDatetime(pkg.updatedAt, layoutUpdatedAt);

  return parseAirportLayoutPackage({
    schemaVersion: 1,
    iata: pkg.iata,
    revision: coerceKacRevision(pkg.revision),
    status: pkg.status ?? "draft",
    layout,
    source,
    precisionGrade: pkg.precisionGrade ?? "schematic",
    createdAt,
    updatedAt,
    publishedAt: pkg.publishedAt ?? null,
  });
}
