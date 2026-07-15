/**
 * KEPI_DESIGN_LAW M33 — ground-truth conformance gate (shared, every airport).
 *
 * M29 proves the routing GRAPH is sane (reachable, no zigzag). This is the
 * separate, harder check the skill demands: does each curated coordinate match
 * the real OSM ground truth for that airport? Both must pass before anything is
 * marked verified — passing one is never proof of the other.
 *
 * It runs against the OSM elements in hand (at import / re-import), so it is a
 * pure function of `(layout, osmElements)` — no network, fully unit-testable with
 * fixtures. It is airport-agnostic: the same checks run for IATA #1 and #100, and
 * where an airport's OSM data can't satisfy a check, that surfaces as an error or
 * a warning — the rule is never loosened to make an airport look finished.
 *
 * Checks:
 *  1. Gate ref exact match — a gate POI claiming `precision:"surveyed"` must sit
 *     on the real `aeroway=gate` node with that `ref` (within a few metres). If
 *     OSM doesn't tag the ref, the gate cannot be surveyed — it stays schematic.
 *  2. Curb/drop-off road proximity — a landside curb node must be within a small
 *     named-constant distance of a real `highway=*` way.
 *  3. Cross-category collision — a POI must not sit on top of an independently
 *     tagged OSM feature of a different category (a "Gate 9" on a restaurant node).
 *  4. Terminal footprint containment — an indoor POI (gate/check-in/lounge) must
 *     fall inside a terminal/concourse footprint, but only after that ring is
 *     confirmed non-self-intersecting (`@turf/kinks`) — never gate on a bad ring.
 *
 * Landside↔airside topology (the fifth rule) is enforced structurally in
 * `validateAirportLayoutGraph` (M31), so it is not repeated here.
 */

import { booleanPointInPolygon, kinks, lineString, point, pointToLineDistance, polygon } from "@turf/turf";
import type { AirportLayout } from "./types";
import type { OsmElement } from "./osmImport";

const EARTH_RADIUS_M = 6_371_000;
/** Great-circle metres. Local copy so this module has no runtime dep on osmImport (avoids an import cycle). */
function haversineMeters(a: [number, number], b: [number, number]): number {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** A surveyed gate must sit within this of its real OSM gate node. */
export const GATE_EXACT_MATCH_M = 6;
/** A landside curb/drop-off node must be within this of a real road. */
export const CURB_ROAD_MAX_M = 40;
/** A POI this close to a different-category OSM feature is sitting ON it (hard fail). */
export const EXACT_COLLISION_M = 3;
/** Wider radius: a category mismatch this close with no same-category feature is suspicious (warning). */
export const COLLISION_RADIUS_M = 12;

/** POI categories that should physically live inside a terminal/concourse. */
const CONTAINMENT_CATEGORIES = new Set(["gate", "checkin", "lounge"]);

export interface GroundTruthReport {
  iata: string;
  errors: string[];
  warnings: string[];
  /** How many of each check actually ran (0 = no data to check against). */
  checked: { gateRefs: number; curbs: number; collisions: number; containment: number };
}

type OsmCategory = "gate" | "restroom" | "lounge" | "food" | "shop";

const LOUNGE_NAME = /lounge|sky club|admirals club|united club|centurion|the club|polaris/i;
const FOOD_AMENITY = /^(restaurant|cafe|fast_food|bar|food_court|pub|ice_cream)$/;

function osmPoint(el: OsmElement): [number, number] | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") return [el.lon, el.lat];
  if (el.center) return [el.center.lon, el.center.lat];
  if (el.geometry && el.geometry.length > 0) {
    const s = el.geometry.reduce<[number, number]>((acc, g) => [acc[0] + g.lon, acc[1] + g.lat], [0, 0]);
    return [s[0] / el.geometry.length, s[1] / el.geometry.length];
  }
  return null;
}

function osmCategory(tags: Record<string, string> | undefined): OsmCategory | null {
  if (!tags) return null;
  if (tags.aeroway === "gate") return "gate";
  if (tags.amenity === "toilets") return "restroom";
  if (tags.amenity === "lounge" || (tags.name && LOUNGE_NAME.test(tags.name))) return "lounge";
  if (tags.amenity && FOOD_AMENITY.test(tags.amenity)) return "food";
  if (tags.shop) return "shop";
  return null;
}

/** Kepi POI category → the OSM category it should collide-match, when one exists. */
function poiToOsmCategory(category: string): OsmCategory | null {
  if (category === "gate") return "gate";
  if (category === "restroom") return "restroom";
  if (category === "lounge") return "lounge";
  return null; // checkin/security/train/baggage/amenity have no 1:1 OSM tag
}

function normalizeRef(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Extract a gate ref from a POI name like "Gate B12" → "B12". */
function gateRefFromName(name: string): string | null {
  const m = name.trim().match(/^gate\s+(.+)$/i);
  const ref = (m ? m[1] : name).trim();
  const norm = normalizeRef(ref);
  return norm.length > 0 ? norm : null;
}

export function checkOsmGroundTruth(layout: AirportLayout, elements: OsmElement[]): GroundTruthReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checked = { gateRefs: 0, curbs: 0, collisions: 0, containment: 0 };

  const nodePos = new Map(layout.nodes.map((n) => [n.id, n.pos]));
  const poiPos = (nodeId: string): [number, number] | null => nodePos.get(nodeId) ?? null;

  /* 1) Gate ref exact match (only gates that CLAIM surveyed precision). */
  const osmGatesByRef = new Map<string, [number, number]>();
  for (const el of elements) {
    if (el.tags?.aeroway !== "gate") continue;
    const ref = el.tags.ref ?? el.tags.name;
    const pos = osmPoint(el);
    if (!ref || !pos) continue;
    osmGatesByRef.set(normalizeRef(ref), pos);
  }
  for (const poi of layout.pois) {
    if (poi.category !== "gate" || poi.precision !== "surveyed") continue;
    const ppos = poiPos(poi.nodeId);
    if (!ppos) continue;
    const ref = gateRefFromName(poi.name);
    if (!ref) {
      warnings.push(`Gate POI ${poi.id} claims surveyed precision but has no parseable ref in "${poi.name}".`);
      continue;
    }
    const truth = osmGatesByRef.get(ref);
    if (!truth) {
      errors.push(
        `Gate ${poi.name} (${poi.id}) claims precision:"surveyed" but OSM has no aeroway=gate with ref ${ref} — ` +
          `it must stay schematic until the ref is ground-truthed (M33).`,
      );
      continue;
    }
    checked.gateRefs += 1;
    const dist = haversineMeters(ppos, truth);
    if (dist > GATE_EXACT_MATCH_M) {
      errors.push(
        `Gate ${poi.name} (${poi.id}) is ${Math.round(dist)} m from its real OSM gate node (ref ${ref}, ` +
          `max ${GATE_EXACT_MATCH_M} m) — a surveyed gate must sit on the exact tagged coordinate (M33).`,
      );
    }
  }

  /* 2) Curb/drop-off proximity to a real road. */
  const highways = elements
    .filter((el) => el.tags?.highway && el.geometry && el.geometry.length >= 2)
    .map((el) => lineString(el.geometry!.map((g) => [g.lon, g.lat])));
  const curbNodes = layout.nodes.filter(
    (n) => !n.airside && n.landmark != null && /curb|drop|depart/i.test(n.landmark),
  );
  if (curbNodes.length > 0) {
    if (highways.length === 0) {
      warnings.push(
        "No OSM highway=* ways were provided, so curb/drop-off → road proximity could not be verified (M33).",
      );
    } else {
      for (const curb of curbNodes) {
        checked.curbs += 1;
        let nearest = Infinity;
        for (const road of highways) {
          nearest = Math.min(nearest, pointToLineDistance(point(curb.pos), road, { units: "meters" }));
        }
        if (nearest > CURB_ROAD_MAX_M) {
          errors.push(
            `Curb/drop-off node ${curb.id} ("${curb.landmark}") is ${Math.round(nearest)} m from the nearest ` +
              `OSM road (max ${CURB_ROAD_MAX_M} m) — a drop-off must sit on a real highway (M33).`,
          );
        }
      }
    }
  }

  /* 3) Cross-category collision — a POI sitting on a different-category feature. */
  const typed = elements
    .map((el) => ({ cat: osmCategory(el.tags), pos: osmPoint(el) }))
    .filter((f): f is { cat: OsmCategory; pos: [number, number] } => f.cat != null && f.pos != null);
  if (typed.length > 0) {
    for (const poi of layout.pois) {
      const poiCat = poiToOsmCategory(poi.category);
      if (!poiCat) continue;
      const ppos = poiPos(poi.nodeId);
      if (!ppos) continue;
      let nearest: { cat: OsmCategory; d: number } | null = null;
      let sameCatWithinRadius = false;
      for (const f of typed) {
        const d = haversineMeters(ppos, f.pos);
        if (f.cat === poiCat && d <= COLLISION_RADIUS_M) sameCatWithinRadius = true;
        if (!nearest || d < nearest.d) nearest = { cat: f.cat, d };
      }
      if (!nearest) continue;
      checked.collisions += 1;
      if (nearest.cat !== poiCat && nearest.d <= EXACT_COLLISION_M) {
        errors.push(
          `POI "${poi.name}" (${poi.id}, ${poi.category}) sits ${nearest.d.toFixed(1)} m from a real OSM ` +
            `${nearest.cat} feature — it is placed on the wrong thing (M33).`,
        );
      } else if (nearest.cat !== poiCat && nearest.d <= COLLISION_RADIUS_M && !sameCatWithinRadius) {
        warnings.push(
          `POI "${poi.name}" (${poi.id}, ${poi.category}) is ${Math.round(nearest.d)} m from a ${nearest.cat} ` +
            `feature and no matching ${poiCat} feature is nearby — verify the placement (M33).`,
        );
      }
    }
  }

  /* 4) Terminal footprint containment (only over non-self-intersecting rings). */
  const validPolys = [];
  for (const zone of layout.zones) {
    const ring = zone.ring;
    if (ring.length < 4) continue;
    const closed =
      ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring
        : [...ring, ring[0]];
    try {
      const poly = polygon([closed]);
      if (kinks(poly).features.length === 0) validPolys.push(poly);
    } catch {
      /* skip a ring turf can't build */
    }
  }
  const containmentPois = layout.pois.filter((p) => CONTAINMENT_CATEGORIES.has(p.category));
  if (containmentPois.length > 0) {
    if (validPolys.length === 0) {
      warnings.push(
        "No non-self-intersecting terminal ring available, so footprint containment was skipped (M33) — " +
          "relying on the other ground-truth checks until the ring is fixed.",
      );
    } else {
      for (const poi of containmentPois) {
        const ppos = poiPos(poi.nodeId);
        if (!ppos) continue;
        checked.containment += 1;
        const inside = validPolys.some((p) => booleanPointInPolygon(point(ppos), p));
        if (!inside) {
          const msg =
            `POI "${poi.name}" (${poi.id}, ${poi.category}) falls outside every terminal/concourse footprint — ` +
            `it is likely on the apron or a parking lot (M33).`;
          if (poi.precision === "surveyed") errors.push(msg);
          else warnings.push(msg);
        }
      }
    }
  }

  return { iata: layout.iata, errors, warnings, checked };
}
