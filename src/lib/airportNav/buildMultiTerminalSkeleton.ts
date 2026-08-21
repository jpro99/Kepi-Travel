/**
 * Shared multi-terminal skeleton builder for new airports (M29 playbook).
 * Gate coords must be SURVEYED OSM centroids; curbs may be building centroids;
 * security is always ESTIMATE (M15/M32).
 */

import type { AirportLayout, GraphEdge, GraphNode, PoiDefinition } from "./types";

const EARTH_M_PER_DEG_LAT = 111_320;
export function metersBetween(a: [number, number], b: [number, number]): number {
  const mPerDegLng = EARTH_M_PER_DEG_LAT * Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180));
  const dx = (b[0] - a[0]) * mPerDegLng;
  const dy = (b[1] - a[1]) * EARTH_M_PER_DEG_LAT;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

const WALK_MPS = 1.25;
export const walkSecs = (m: number) => Math.max(5, Math.round(m / WALK_MPS));

export function lerpPos(a: [number, number], b: [number, number], t: number): [number, number] {
  return [
    Number((a[0] + (b[0] - a[0]) * t).toFixed(6)),
    Number((a[1] + (b[1] - a[1]) * t).toFixed(6)),
  ];
}

/**
 * Closed ring around surveyed anchors for map framing only — NOT a surveyed
 * OSM building footprint. Label zones accordingly in the layout file.
 */
export function schematicZoneRing(
  points: Array<[number, number]>,
  padMeters = 80,
): [number, number][] {
  if (points.length === 0) return [[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]];
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const dLat = padMeters / EARTH_M_PER_DEG_LAT;
  const dLng = padMeters / (EARTH_M_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180));
  const minLng = Math.min(...lngs) - dLng;
  const maxLng = Math.max(...lngs) + dLng;
  const minLat = Math.min(...lats) - dLat;
  const maxLat = Math.max(...lats) + dLat;
  return [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
    [minLng, minLat],
  ];
}

export interface GateClusterSpec {
  id: string;
  label: string;
  /** SURVEYED OSM gate-cluster centroid [lng, lat]. */
  gate: [number, number];
  prefix: string;
}

export interface TerminalUnitSpec {
  id: string;
  name: string;
  /** Prefer real OSM terminal/building centroid; else ESTIMATE. */
  curb: [number, number];
  curbPrecision?: "surveyed" | "schematic" | "extrapolated";
  gates: GateClusterSpec[];
  securityMinutes?: { standard: number; precheck: number };
}

export interface LoungeSpec {
  id: string;
  name: string;
  pos: [number, number];
  hangOffGateId: string;
  airline?: string;
}

export interface AirsideLinkSpec {
  id: string;
  fromGateId: string;
  toGateId: string;
  kind?: "walkway" | "train" | "moving_walkway";
  extraSeconds?: number;
}

export function buildMultiTerminalSkeleton(input: {
  terminals: TerminalUnitSpec[];
  lounges?: LoungeSpec[];
  /** Landside curb walk order (terminal ids). */
  curbChain?: string[];
  airsideLinks?: AirsideLinkSpec[];
  securityNote: string;
}): { nodes: GraphNode[]; edges: GraphEdge[]; pois: PoiDefinition[]; gateNodeResolver: AirportLayout["gateNodeResolver"] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const pois: PoiDefinition[] = [];
  const gateNodeResolver: NonNullable<AirportLayout["gateNodeResolver"]> = [];

  for (const t of input.terminals) {
    const curbId = `curb-${t.id}`;
    const secEntryId = `sec-${t.id}-entry`;
    const secExitId = `sec-${t.id}-exit`;
    const primaryGate = t.gates[0]!;
    const secEntry = lerpPos(t.curb, primaryGate.gate, 0.4);
    const secExit = lerpPos(t.curb, primaryGate.gate, 0.6);
    const stdMin = t.securityMinutes?.standard ?? 12;
    const preMin = t.securityMinutes?.precheck ?? 6;

    nodes.push({
      id: curbId,
      pos: t.curb,
      kind: "junction",
      airside: false,
      landmark: `${t.name} — ticketing & curb (drop-off)`,
    });
    nodes.push({
      id: secEntryId,
      pos: secEntry,
      kind: "security_entry",
      airside: false,
      landmark: `${t.name} security checkpoint`,
    });
    nodes.push({
      id: secExitId,
      pos: secExit,
      kind: "security_exit",
      airside: true,
      landmark: `${t.name} — past security`,
    });

    const curbToSec = Math.max(15, metersBetween(t.curb, secEntry));
    edges.push({
      id: `e-${t.id}-curb-sec`,
      from: curbId,
      to: secEntryId,
      kind: "walkway",
      lengthM: curbToSec,
      traverseSeconds: walkSecs(curbToSec),
      bidirectional: true,
    });
    edges.push({
      id: `e-${t.id}-sec-std`,
      from: secEntryId,
      to: secExitId,
      kind: "security_transition",
      lengthM: 40,
      traverseSeconds: stdMin * 60,
      bidirectional: false,
      laneType: "standard",
    });
    edges.push({
      id: `e-${t.id}-sec-pre`,
      from: secEntryId,
      to: secExitId,
      kind: "security_transition",
      lengthM: 40,
      traverseSeconds: preMin * 60,
      bidirectional: false,
      laneType: "precheck",
    });

    pois.push({
      id: `poi-sec-${t.id}`,
      nodeId: secEntryId,
      category: "security",
      name: `${t.name} security`,
      lanes: ["standard", "precheck"],
      notes: input.securityNote,
    });
    pois.push({
      id: `poi-checkin-${t.id}`,
      nodeId: curbId,
      category: "checkin",
      name: `${t.name} check-in`,
      precision: t.curbPrecision ?? "schematic",
    });

    for (const g of t.gates) {
      const gateId = `gate-${g.id}`;
      nodes.push({ id: gateId, pos: g.gate, kind: "gate", airside: true, landmark: g.label });
      const secToGate = Math.max(15, metersBetween(secExit, g.gate));
      edges.push({
        id: `e-${t.id}-sec-${g.id}`,
        from: secExitId,
        to: gateId,
        kind: "walkway",
        lengthM: secToGate,
        traverseSeconds: walkSecs(secToGate),
        bidirectional: true,
      });
      pois.push({
        id: `poi-gate-${g.id}`,
        nodeId: gateId,
        category: "gate",
        name: g.label,
        precision: "surveyed",
      });
      gateNodeResolver.push({ prefix: g.prefix, nodeId: gateId });
    }

    // Airside pier walk between gate clusters in the same terminal.
    for (let i = 0; i < t.gates.length - 1; i += 1) {
      const a = t.gates[i]!;
      const b = t.gates[i + 1]!;
      const len = Math.max(15, metersBetween(a.gate, b.gate));
      edges.push({
        id: `e-pier-${a.id}-${b.id}`,
        from: `gate-${a.id}`,
        to: `gate-${b.id}`,
        kind: "walkway",
        lengthM: len,
        traverseSeconds: walkSecs(len),
        bidirectional: true,
      });
    }
  }

  const curbChain = input.curbChain ?? input.terminals.map((t) => t.id);
  for (let i = 0; i < curbChain.length - 1; i += 1) {
    const a = input.terminals.find((t) => t.id === curbChain[i]);
    const b = input.terminals.find((t) => t.id === curbChain[i + 1]);
    if (!a || !b) continue;
    const len = Math.max(15, metersBetween(a.curb, b.curb));
    edges.push({
      id: `e-frontage-${a.id}-${b.id}`,
      from: `curb-${a.id}`,
      to: `curb-${b.id}`,
      kind: "walkway",
      lengthM: len,
      traverseSeconds: walkSecs(len),
      bidirectional: true,
    });
  }

  for (const link of input.airsideLinks ?? []) {
    const from = `gate-${link.fromGateId}`;
    const to = `gate-${link.toGateId}`;
    const fromNode = nodes.find((n) => n.id === from);
    const toNode = nodes.find((n) => n.id === to);
    if (!fromNode || !toNode) continue;
    const len = Math.max(20, metersBetween(fromNode.pos, toNode.pos));
    edges.push({
      id: link.id,
      from,
      to,
      kind: link.kind ?? "walkway",
      lengthM: len,
      traverseSeconds: walkSecs(len) + (link.extraSeconds ?? 0),
      bidirectional: true,
    });
  }

  for (const l of input.lounges ?? []) {
    nodes.push({ id: l.id, pos: l.pos, kind: "lounge", airside: true, landmark: l.name });
    const anchorId = l.hangOffGateId.startsWith("gate-") ? l.hangOffGateId : `gate-${l.hangOffGateId}`;
    const anchor = nodes.find((n) => n.id === anchorId) ?? nodes.find((n) => n.airside && n.kind === "gate")!;
    const len = Math.max(15, metersBetween(anchor.pos, l.pos));
    edges.push({
      id: `e-${anchor.id}-${l.id}`,
      from: anchor.id,
      to: l.id,
      kind: "walkway",
      lengthM: len,
      traverseSeconds: walkSecs(len) + 30,
      bidirectional: true,
    });
    pois.push({
      id: `poi-${l.id}`,
      nodeId: l.id,
      category: "lounge",
      name: l.name,
      airline: l.airline,
      precision: "surveyed",
    });
  }

  return { nodes, edges, pois, gateNodeResolver };
}
