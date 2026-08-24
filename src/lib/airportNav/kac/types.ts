/**
 * KAC (Kepi Airport Cartographer) compiler JSON — draft ingest shape.
 * Extra keys (cookbookClass, compilerStage, honesty, node notes) are stripped
 * by adaptKacCompilerJson before Zod validation.
 */

import type { GraphEdgeKind, GraphNodeKind } from "../types";

export interface KacCompilerNode {
  id: string;
  kind: GraphNodeKind;
  pos: [number, number];
  airside: boolean;
  /** Compiler-only; mapped to landmark on GraphNode or POI name. */
  name?: string;
  precision?: "surveyed" | "schematic" | "extrapolated";
  doorLabel?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface KacCompilerEdge {
  id: string;
  from: string;
  to: string;
  kind: GraphEdgeKind;
  lengthM?: number;
  traverseSeconds?: number;
  bidirectional?: boolean;
  laneType?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface KacCompilerLayout {
  iata: string;
  name: string;
  layoutVersion: string;
  updatedAt: string;
  center: [number, number];
  routeGrade?: "surveyed" | "schematic";
  zones: Array<{
    id: string;
    name: string;
    ring: [number, number][];
    airside: boolean;
    heightM: number;
    [key: string]: unknown;
  }>;
  nodes: KacCompilerNode[];
  edges: KacCompilerEdge[];
  pois?: unknown[];
  gateNodeResolver?: Array<{ prefix: string; nodeId: string }>;
  cookbookClass?: string;
  compilerStage?: string;
  honesty?: unknown;
  [key: string]: unknown;
}

export interface KacCompilerPackage {
  schemaVersion: number;
  iata: string;
  revision: number;
  status: "draft" | "published";
  layout: KacCompilerLayout;
  precisionGrade?: "schematic" | "surveyed";
  source?: {
    ownership: "kepi_original";
    attribution: string;
    sourceUrls: string[];
    licenseNote: string;
    lastVerifiedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
  [key: string]: unknown;
}
