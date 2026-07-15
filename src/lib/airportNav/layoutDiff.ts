/**
 * Diff a published layout against a fresh OSM (or edited) draft so curators see
 * what changed before overwrite — master prompt §2 / M35.
 * Never auto-publishes; caller returns this on import for review.
 */

import type { AirportLayout, PoiDefinition } from "./types";

const MOVE_THRESHOLD_M = 25;

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function poiPos(layout: AirportLayout, poi: PoiDefinition): [number, number] | null {
  const node = layout.nodes.find((n) => n.id === poi.nodeId);
  return node ? node.pos : null;
}

function poiKey(poi: PoiDefinition): string {
  const iata = poi.airlineIataCode?.toUpperCase();
  if (iata) return `airline:${iata}`;
  const gate = /^Gate\s+(.+)$/i.exec(poi.name)?.[1]?.trim().toUpperCase();
  if (poi.category === "gate" && gate) return `gate:${gate}`;
  return `id:${poi.id}`;
}

export interface LayoutPoiChange {
  key: string;
  name: string;
  category: PoiDefinition["category"];
  fromPos?: [number, number];
  toPos?: [number, number];
  distanceM?: number;
}

export interface AirportLayoutDiff {
  added: LayoutPoiChange[];
  removed: LayoutPoiChange[];
  moved: LayoutPoiChange[];
  /** Human-readable one-liner for admin banners. */
  summary: string;
}

export function diffAirportLayouts(
  published: AirportLayout,
  draft: AirportLayout,
  options?: { moveThresholdM?: number },
): AirportLayoutDiff {
  const threshold = options?.moveThresholdM ?? MOVE_THRESHOLD_M;
  const pubByKey = new Map<string, PoiDefinition>();
  for (const poi of published.pois) pubByKey.set(poiKey(poi), poi);
  const draftByKey = new Map<string, PoiDefinition>();
  for (const poi of draft.pois) draftByKey.set(poiKey(poi), poi);

  const added: LayoutPoiChange[] = [];
  const removed: LayoutPoiChange[] = [];
  const moved: LayoutPoiChange[] = [];

  for (const [key, poi] of draftByKey) {
    if (!pubByKey.has(key)) {
      const pos = poiPos(draft, poi);
      added.push({
        key,
        name: poi.name,
        category: poi.category,
        toPos: pos ?? undefined,
      });
    }
  }
  for (const [key, poi] of pubByKey) {
    if (!draftByKey.has(key)) {
      const pos = poiPos(published, poi);
      removed.push({
        key,
        name: poi.name,
        category: poi.category,
        fromPos: pos ?? undefined,
      });
    }
  }
  for (const [key, draftPoi] of draftByKey) {
    const pubPoi = pubByKey.get(key);
    if (!pubPoi) continue;
    const from = poiPos(published, pubPoi);
    const to = poiPos(draft, draftPoi);
    if (!from || !to) continue;
    const distanceM = haversineM(from, to);
    if (distanceM >= threshold) {
      moved.push({
        key,
        name: draftPoi.name,
        category: draftPoi.category,
        fromPos: from,
        toPos: to,
        distanceM: Math.round(distanceM),
      });
    }
  }

  const parts: string[] = [];
  if (added.length) parts.push(`${added.length} added`);
  if (removed.length) parts.push(`${removed.length} removed`);
  if (moved.length) parts.push(`${moved.length} moved ≥${threshold}m`);
  const summary = parts.length
    ? `vs published: ${parts.join(", ")}`
    : "vs published: no material POI changes";

  return { added, removed, moved, summary };
}
