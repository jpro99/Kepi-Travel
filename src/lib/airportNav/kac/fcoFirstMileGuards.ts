/**
 * Curated FCO arrival first-mile IDs — overlay must never replace these.
 * passport → bags → customs → Leonardo (2026-08-23 curated fco.ts).
 */

export const FCO_CURATED_FIRST_MILE_NODE_IDS = [
  "passport-t3",
  "baggage-t3",
  "customs-t3",
  "ground-leonardo",
  "ground-taxi-fco",
  "gate-e",
  "curb-t3",
] as const;

export const FCO_CURATED_FIRST_MILE_EDGE_IDS = [
  "e-gate-e-passport",
  "e-passport-baggage",
  "e-baggage-customs",
  "e-customs-curb",
  "e-t3-curb-leonardo",
  "e-t3-curb-taxi",
] as const;

export const FCO_CURATED_FIRST_MILE_POI_IDS = [
  "poi-passport-t3",
  "poi-baggage-t3",
  "poi-customs-t3",
  "poi-leonardo-express",
  "poi-fl1-regional",
  "poi-official-taxi-fco",
] as const;

export function isFcoCuratedFirstMileNodeId(id: string): boolean {
  return (FCO_CURATED_FIRST_MILE_NODE_IDS as readonly string[]).includes(id);
}

export function isFcoCuratedFirstMileEdgeId(id: string): boolean {
  return (FCO_CURATED_FIRST_MILE_EDGE_IDS as readonly string[]).includes(id);
}

export function isFcoCuratedFirstMilePoiId(id: string): boolean {
  return (FCO_CURATED_FIRST_MILE_POI_IDS as readonly string[]).includes(id);
}
