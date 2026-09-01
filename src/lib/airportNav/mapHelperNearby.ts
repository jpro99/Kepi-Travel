/**
 * Nearby one-tap chips for map helpers — Apple-simple: big Door / Starbucks
 * buttons from the layout near the traveler. No typing on the happy path.
 */

import type { AirportLayout, PoiDefinition } from "./types";

export interface MapHelperChip {
  id: string;
  kind: "confirm_poi" | "confirm_door";
  label: string;
  poiId?: string;
  poiName?: string;
  poiCategory?: string;
  doorLabel?: string;
  nodeId?: string;
  distM: number;
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const DOOR_RADIUS_M = 55;
const AMENITY_RADIUS_M = 40;
const GATE_RADIUS_M = 50;
const MAX_CHIPS = 8;

const TAP_CATEGORIES = new Set<PoiDefinition["category"]>([
  "amenity",
  "restroom",
  "lounge",
  "checkin",
  "baggage",
  "gate",
]);

function nodePos(layout: AirportLayout, nodeId: string): [number, number] | null {
  const node = layout.nodes.find((n) => n.id === nodeId);
  return node ? node.pos : null;
}

function poiDistM(layout: AirportLayout, poi: PoiDefinition, from: [number, number]): number | null {
  const pos = nodePos(layout, poi.nodeId);
  if (!pos) return null;
  return haversineMeters(from, pos);
}

/**
 * Build one-tap chips near the traveler. Prefer named amenities + door-labeled
 * check-ins; merge duplicate door numbers into a single Door chip.
 */
export function buildMapHelperNearbyChips(
  layout: AirportLayout,
  from: [number, number] | null,
  options?: { maxChips?: number },
): MapHelperChip[] {
  if (!from) return [];
  const max = options?.maxChips ?? MAX_CHIPS;
  const doorChips = new Map<string, MapHelperChip>();
  const poiChips: MapHelperChip[] = [];

  for (const poi of layout.pois) {
    const dist = poiDistM(layout, poi, from);
    if (dist == null) continue;

    const doorLabel = poi.doorLabel?.trim();
    if (doorLabel && dist <= DOOR_RADIUS_M) {
      const key = doorLabel.toLowerCase();
      const existing = doorChips.get(key);
      if (!existing || dist < existing.distM) {
        doorChips.set(key, {
          id: `door:${doorLabel}`,
          kind: "confirm_door",
          label: doorLabel.startsWith("Door") ? doorLabel : `Door ${doorLabel}`,
          poiId: poi.id,
          poiName: poi.name,
          poiCategory: poi.category,
          doorLabel,
          nodeId: poi.nodeId,
          distM: dist,
        });
      }
    }

    if (!TAP_CATEGORIES.has(poi.category)) continue;
    const name = (poi.name ?? "").trim();
    if (!name || name.length < 2) continue;
    // Generic bag-drop is covered by Door chips; keep named airline counters.
    if (poi.category === "checkin" && !poi.airline && !poi.airlineIataCode) continue;

    const radius = poi.category === "gate" ? GATE_RADIUS_M : AMENITY_RADIUS_M;
    if (dist > radius) continue;

    let label = name.length > 28 ? `${name.slice(0, 26)}…` : name;
    if (poi.category === "gate") {
      label = /gate/i.test(name) ? `${name}?` : `Gate ${name}?`;
    } else if (poi.category === "checkin" && (poi.airline || poi.airlineIataCode)) {
      const carrier = (poi.airline || poi.airlineIataCode || "").trim();
      label = carrier ? `${carrier} here?` : label;
      if (label.length > 28) label = `${label.slice(0, 26)}…`;
    }

    poiChips.push({
      id: `poi:${poi.id}`,
      kind: "confirm_poi",
      label,
      poiId: poi.id,
      poiName: name,
      poiCategory: poi.category,
      doorLabel: doorLabel || undefined,
      nodeId: poi.nodeId,
      distM: dist,
    });
  }

  const doors = [...doorChips.values()].sort((a, b) => a.distM - b.distM);
  const amenities = poiChips.sort((a, b) => a.distM - b.distM);

  // Prefer amenities (Starbucks) + doors interleaved by distance.
  const merged = [...doors, ...amenities].sort((a, b) => a.distM - b.distM);
  const seen = new Set<string>();
  const out: MapHelperChip[] = [];
  for (const chip of merged) {
    const dedupe = chip.kind === "confirm_door" ? chip.id : `name:${(chip.poiName ?? "").toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(chip);
    if (out.length >= max) break;
  }
  return out;
}
