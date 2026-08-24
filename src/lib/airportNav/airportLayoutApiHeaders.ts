/**
 * Cache headers for airport layout JSON APIs.
 *
 * Layout bodies can change without a layoutVersion bump (e.g. KAC overlay edge
 * bridges). Public CDN caching keyed only on path + version caused stale graphs
 * on first GET — forbid stored reuse at browser, shared, and Vercel edge.
 */

export const AIRPORT_LAYOUT_API_CACHE_CONTROL =
  "private, no-cache, no-store, max-age=0, must-revalidate";

/** Vercel edge — separate from Cache-Control so the CDN cannot serve stale JSON. */
export const AIRPORT_LAYOUT_API_CDN_CACHE_CONTROL = "no-store";

export function buildAirportLayoutApiResponseHeaders(input: {
  iata: string;
  layoutVersion: string;
  revision: number;
  source: string;
  edgeCount: number;
  nodeCount: number;
}): Record<string, string> {
  const code = input.iata.trim().toUpperCase();
  return {
    "Cache-Control": AIRPORT_LAYOUT_API_CACHE_CONTROL,
    "CDN-Cache-Control": AIRPORT_LAYOUT_API_CDN_CACHE_CONTROL,
    Pragma: "no-cache",
    ETag: `"${code}:${input.revision}:${input.layoutVersion}:${input.edgeCount}:${input.nodeCount}"`,
    "X-Kepi-Airport-Layout-Source": input.source,
    "X-Kepi-Airport-Layout-Revision": String(input.revision),
  };
}
