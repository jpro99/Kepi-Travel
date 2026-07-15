/**
 * Control-point anchor pooling (KEPI_DESIGN_LAW M27 / master prompt §6).
 *
 * A door-row alone under-determines depth into the terminal. Pool every real,
 * independently-tagged OSM coordinate that can serve as a georeferencing anchor
 * — doors, gates, lounges, elevators, escalators — so a 2D transform has
 * distributed control points, not a single curb line. Airport-agnostic: same
 * function for every IATA; categories that aren't tagged at that airport simply
 * contribute zero anchors (never invent them).
 */

import type { OsmElement } from "./osmImport";

export type ControlPointKind =
  | "door"
  | "gate"
  | "lounge"
  | "elevator"
  | "escalator"
  | "amenity";

export interface ControlPointAnchor {
  id: string;
  kind: ControlPointKind;
  label: string;
  /** [lng, lat] — exact OSM coordinate. */
  pos: [number, number];
  osmRef?: string;
}

const LOUNGE_NAME = /lounge|sky club|admirals club|united club|centurion|the club|polaris/i;

function pointFromElement(el: OsmElement): [number, number] | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") return [el.lon, el.lat];
  if (el.center) return [el.center.lon, el.center.lat];
  if (el.geometry && el.geometry.length > 0) {
    const s = el.geometry.reduce<[number, number]>((acc, g) => [acc[0] + g.lon, acc[1] + g.lat], [0, 0]);
    return [s[0] / el.geometry.length, s[1] / el.geometry.length];
  }
  return null;
}

function classify(el: OsmElement): { kind: ControlPointKind; label: string; ref?: string } | null {
  const tags = el.tags ?? {};
  if (tags.aeroway === "gate") {
    const ref = (tags.ref || tags.name || "").trim();
    return { kind: "gate", label: ref ? `Gate ${ref}` : "Gate", ref: ref || undefined };
  }
  if (tags.entrance && (tags.ref || tags.name)) {
    const ref = (tags.ref || tags.name || "").trim();
    return { kind: "door", label: ref ? `Door ${ref}` : "Entrance", ref: ref || undefined };
  }
  if (tags.highway === "elevator" || tags.elevator === "yes") {
    return { kind: "elevator", label: tags.name?.trim() || "Elevator" };
  }
  if (tags.highway === "steps" && (tags.conveying === "yes" || tags.conveying === "forward" || tags.conveying === "backward")) {
    return { kind: "escalator", label: tags.name?.trim() || "Escalator" };
  }
  if (tags.amenity === "lounge" || (tags.name && LOUNGE_NAME.test(tags.name))) {
    return { kind: "lounge", label: tags.name?.trim() || "Lounge" };
  }
  if (tags.amenity === "toilets" || tags.shop || tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "fast_food" || tags.amenity === "bank" || tags.amenity === "atm") {
    const name = tags.name?.trim();
    if (!name && tags.amenity === "toilets") return { kind: "amenity", label: "Restrooms" };
    if (!name) return null; // unnamed shop/food — not a useful named control point
    return { kind: "amenity", label: name };
  }
  return null;
}

/**
 * Collect every usable control-point anchor from OSM elements for an airport.
 * Dedupes by rounded coordinate (~1 m) so a dual-tagged node doesn't double-count.
 */
export function poolControlPointAnchors(elements: OsmElement[]): ControlPointAnchor[] {
  const out: ControlPointAnchor[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const classified = classify(el);
    const pos = pointFromElement(el);
    if (!classified || !pos) continue;
    const key = `${pos[0].toFixed(5)},${pos[1].toFixed(5)},${classified.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `cp-${el.type}-${el.id}`,
      kind: classified.kind,
      label: classified.label,
      pos,
      osmRef: classified.ref,
    });
  }
  return out;
}

export function summarizeControlPointPool(anchors: ControlPointAnchor[]): Record<ControlPointKind, number> {
  const counts: Record<ControlPointKind, number> = {
    door: 0,
    gate: 0,
    lounge: 0,
    elevator: 0,
    escalator: 0,
    amenity: 0,
  };
  for (const a of anchors) counts[a.kind] += 1;
  return counts;
}

/**
 * True when the pool has enough *spatial diversity* for a 2D draft transform —
 * not just a single door row. Requires at least 3 anchors spanning ≥2 kinds
 * (e.g. doors + gates, or doors + elevators) so depth into the terminal is
 * constrained. A door-only pool is fine for 1D curve interpolation (M27) but
 * insufficient for broad 2D georeferencing.
 */
export function controlPointPoolSupports2dTransform(anchors: ControlPointAnchor[]): boolean {
  if (anchors.length < 3) return false;
  const kinds = new Set(anchors.map((a) => a.kind));
  return kinds.size >= 2;
}
