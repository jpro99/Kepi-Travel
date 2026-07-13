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

export type AirportLayoutPrecisionGrade = "schematic" | "surveyed";

/** Human sign-off that the rendered draft looked physically correct on the map. */
export interface AirportLayoutPreviewConfirmation {
  /** ISO timestamp; defaults to package creation time when omitted. */
  at?: string;
  /** Who confirmed the rendered preview (admin user id, or "kepi-seed-bundle"). */
  by: string;
}

export interface AirportLayoutPackage {
  schemaVersion: typeof AIRPORT_LAYOUT_PACKAGE_SCHEMA_VERSION;
  iata: string;
  revision: number;
  status: "draft" | "published";
  layout: AirportLayout;
  source: AirportLayoutPackageSource;
  precisionGrade: AirportLayoutPrecisionGrade;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  /** Set when a human confirmed the rendered visual preview (required to publish). */
  previewConfirmedAt?: string;
  previewConfirmedBy?: string;
  /** When set, the layout payload also lives in Vercel Blob at this URL. */
  layoutBlobUrl?: string;
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
  // Defaults keep packages stored before this field existed parseable.
  precisionGrade: z.enum(["schematic", "surveyed"]).default("schematic"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable(),
  previewConfirmedAt: z.string().datetime().optional(),
  previewConfirmedBy: z.string().trim().min(1).optional(),
  layoutBlobUrl: z.string().url().optional(),
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
  precisionGrade?: AirportLayoutPrecisionGrade;
  previewConfirmation?: AirportLayoutPreviewConfirmation;
}): AirportLayoutPackage {
  const layout = parseAirportLayout(input.layout);
  const nowIso = (input.now ?? new Date()).toISOString();
  const status = input.status ?? "published";
  const confirmedBy = input.previewConfirmation?.by?.trim();
  // Enforced at creation time only, so legacy stored packages still parse on read.
  if (status === "published" && !confirmedBy) {
    throw new Error(
      "Publishing requires visual preview confirmation: a human must confirm the rendered draft (previewConfirmation.by).",
    );
  }
  return parseAirportLayoutPackage({
    schemaVersion: AIRPORT_LAYOUT_PACKAGE_SCHEMA_VERSION,
    iata: layout.iata,
    revision: input.revision ?? 1,
    status,
    layout,
    source: input.source,
    precisionGrade: input.precisionGrade ?? "schematic",
    createdAt: input.createdAt ?? nowIso,
    updatedAt: nowIso,
    publishedAt: status === "published" ? nowIso : null,
    previewConfirmedAt: confirmedBy ? input.previewConfirmation?.at ?? nowIso : undefined,
    previewConfirmedBy: confirmedBy || undefined,
  });
}

export function createNextAirportLayoutPackage(input: {
  layout: AirportLayout;
  source: AirportLayoutPackageSource;
  status: "draft" | "published";
  existingPublished?: AirportLayoutPackage | null;
  existingDraft?: AirportLayoutPackage | null;
  now?: Date;
  precisionGrade?: AirportLayoutPrecisionGrade;
  previewConfirmation?: AirportLayoutPreviewConfirmation;
}): AirportLayoutPackage {
  const currentForStatus = input.status === "published"
    ? input.existingPublished
    : input.existingDraft;
  const latestRevision = Math.max(
    input.existingPublished?.revision ?? 0,
    input.existingDraft?.revision ?? 0,
  );
  return createAirportLayoutPackage({
    layout: input.layout,
    source: input.source,
    revision: latestRevision + 1,
    status: input.status,
    now: input.now,
    createdAt:
      currentForStatus?.createdAt
      ?? input.existingPublished?.createdAt
      ?? input.existingDraft?.createdAt,
    precisionGrade: input.precisionGrade ?? currentForStatus?.precisionGrade,
    previewConfirmation: input.previewConfirmation,
  });
}
