import { z } from "zod";
import type { AirportLayout } from "@/lib/airportNav/types";

export const AIRPORT_LAYOUT_PACKAGE_SCHEMA_VERSION = 1 as const;

const PositionSchema = z.tuple([z.number().finite(), z.number().finite()]);

const AirportLayoutSchema = z.object({
  iata: z.string().trim().regex(/^[A-Z]{3}$/),
  name: z.string().trim().min(1),
  layoutVersion: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  center: PositionSchema,
  zones: z.array(z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    ring: z.array(PositionSchema).min(4),
    airside: z.boolean(),
    heightM: z.number().finite().nonnegative(),
  })).min(1),
  nodes: z.array(z.object({
    id: z.string().trim().min(1),
    pos: PositionSchema,
    kind: z.enum([
      "junction",
      "door",
      "gate",
      "lounge",
      "checkin",
      "security_entry",
      "security_exit",
      "train_platform",
      "restroom",
      "landmark",
    ]),
    airside: z.boolean(),
    landmark: z.string().trim().min(1).optional(),
  })).min(1),
  edges: z.array(z.object({
    id: z.string().trim().min(1),
    from: z.string().trim().min(1),
    to: z.string().trim().min(1),
    kind: z.enum(["walkway", "moving_walkway", "escalator", "train", "security_transition"]),
    lengthM: z.number().finite().positive(),
    traverseSeconds: z.number().finite().positive(),
    bidirectional: z.boolean(),
    laneType: z.enum(["standard", "precheck", "clear", "clear_precheck", "priority"]).optional(),
  })).min(1),
  pois: z.array(z.object({
    id: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
    category: z.enum(["gate", "checkin", "security", "lounge", "restroom", "train", "baggage"]),
    name: z.string().trim().min(1),
    airline: z.string().trim().min(1).optional(),
    lanes: z.array(z.enum(["standard", "precheck", "clear", "clear_precheck", "priority"])).optional(),
    notes: z.string().trim().min(1).optional(),
  })).min(1),
  gateNodeResolver: z.array(z.object({
    prefix: z.string().trim().min(1),
    nodeId: z.string().trim().min(1),
  })),
});

export interface AirportLayoutPackageSource {
  ownership: "kepi_original";
  attribution: string;
  sourceUrls: string[];
  licenseNote: string;
  lastVerifiedAt: string;
}

export interface AirportLayoutPackage {
  schemaVersion: typeof AIRPORT_LAYOUT_PACKAGE_SCHEMA_VERSION;
  iata: string;
  revision: number;
  status: "draft" | "published";
  layout: AirportLayout;
  source: AirportLayoutPackageSource;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

const AirportLayoutPackageSchema = z.object({
  schemaVersion: z.literal(AIRPORT_LAYOUT_PACKAGE_SCHEMA_VERSION),
  iata: z.string().trim().regex(/^[A-Z]{3}$/),
  revision: z.number().int().positive(),
  status: z.enum(["draft", "published"]),
  layout: AirportLayoutSchema,
  source: z.object({
    ownership: z.literal("kepi_original"),
    attribution: z.string().trim().min(1),
    sourceUrls: z.array(z.string().url()),
    licenseNote: z.string().trim().min(1),
    lastVerifiedAt: z.string().trim().min(1),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
});

function duplicateIds(items: Array<{ id: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates];
}

export function validateAirportLayoutGraph(layout: AirportLayout): string[] {
  const issues: string[] = [];
  const nodeIds = new Set(layout.nodes.map((node) => node.id));

  for (const [label, items] of [
    ["zone", layout.zones],
    ["node", layout.nodes],
    ["edge", layout.edges],
    ["POI", layout.pois],
  ] as const) {
    for (const id of duplicateIds(items)) issues.push(`Duplicate ${label} id: ${id}`);
  }

  for (const edge of layout.edges) {
    if (!nodeIds.has(edge.from)) issues.push(`Edge ${edge.id} has unknown from node: ${edge.from}`);
    if (!nodeIds.has(edge.to)) issues.push(`Edge ${edge.id} has unknown to node: ${edge.to}`);
    if (edge.from === edge.to) issues.push(`Edge ${edge.id} cannot connect a node to itself`);
    if (edge.kind === "security_transition" && !edge.laneType) {
      issues.push(`Security edge ${edge.id} is missing laneType`);
    }
  }
  for (const poi of layout.pois) {
    if (!nodeIds.has(poi.nodeId)) issues.push(`POI ${poi.id} has unknown node: ${poi.nodeId}`);
  }
  for (const resolver of layout.gateNodeResolver) {
    if (!nodeIds.has(resolver.nodeId)) {
      issues.push(`Gate prefix ${resolver.prefix} has unknown node: ${resolver.nodeId}`);
    }
  }
  for (const zone of layout.zones) {
    const first = zone.ring[0];
    const last = zone.ring[zone.ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      issues.push(`Zone ${zone.id} ring must be closed`);
    }
  }
  return issues;
}

export function parseAirportLayout(value: unknown): AirportLayout {
  const layout = AirportLayoutSchema.parse(value) as AirportLayout;
  const issues = validateAirportLayoutGraph(layout);
  if (issues.length > 0) throw new Error(issues.join("; "));
  return layout;
}

export function parseAirportLayoutPackage(value: unknown): AirportLayoutPackage {
  const parsed = AirportLayoutPackageSchema.parse(value) as AirportLayoutPackage;
  if (parsed.iata !== parsed.layout.iata) {
    throw new Error(`Package IATA ${parsed.iata} does not match layout IATA ${parsed.layout.iata}`);
  }
  const issues = validateAirportLayoutGraph(parsed.layout);
  if (issues.length > 0) throw new Error(issues.join("; "));
  return parsed;
}

export function createAirportLayoutPackage(input: {
  layout: AirportLayout;
  source: AirportLayoutPackageSource;
  revision?: number;
  status?: "draft" | "published";
  now?: Date;
  createdAt?: string;
}): AirportLayoutPackage {
  const layout = parseAirportLayout(input.layout);
  const nowIso = (input.now ?? new Date()).toISOString();
  const status = input.status ?? "published";
  return parseAirportLayoutPackage({
    schemaVersion: AIRPORT_LAYOUT_PACKAGE_SCHEMA_VERSION,
    iata: layout.iata,
    revision: input.revision ?? 1,
    status,
    layout,
    source: input.source,
    createdAt: input.createdAt ?? nowIso,
    updatedAt: nowIso,
    publishedAt: status === "published" ? nowIso : null,
  });
}
