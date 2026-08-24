/**
 * Curated BRI departures graph IDs — KAC overlay must never replace these.
 * buildMultiTerminalSkeleton main terminal (bri.ts, Overpass 2026-07-17).
 */

export const BRI_CURATED_NODE_IDS = [
  "curb-main",
  "sec-main-entry",
  "sec-main-exit",
  "gate-a",
  "gate-b",
] as const;

export const BRI_CURATED_EDGE_IDS = [
  "e-main-curb-sec",
  "e-main-sec-std",
  "e-main-sec-pre",
  "e-main-sec-a",
  "e-main-sec-b",
  "e-pier-a-b",
] as const;

export const BRI_CURATED_POI_IDS = [
  "poi-sec-main",
  "poi-checkin-main",
  "poi-gate-a",
  "poi-gate-b",
] as const;

export function isBriCuratedNodeId(id: string): boolean {
  return (BRI_CURATED_NODE_IDS as readonly string[]).includes(id);
}

export function isBriCuratedEdgeId(id: string): boolean {
  return (BRI_CURATED_EDGE_IDS as readonly string[]).includes(id);
}

export function isBriCuratedPoiId(id: string): boolean {
  return (BRI_CURATED_POI_IDS as readonly string[]).includes(id);
}
