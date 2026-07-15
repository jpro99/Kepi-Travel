/**
 * KEPI_DESIGN_LAW M35 — never present an unsourveyed pin as confidently as a surveyed one.
 *
 * Security already uses SECURITY_APPROX_TAG (M32). Check-in / other POIs that are only
 * curve-interpolated or hull-extrapolated must carry a short honesty tag on the traveler
 * map so they don't look identical to surveyed OSM doors.
 */

import type { PoiDefinition } from "./types";
import { SECURITY_APPROX_TAG } from "./securityDisclosure";

/** Short on-map tag for schematic (interpolated) coordinates. */
export const SCHEMATIC_LOCATION_TAG = "approx. location";

/** Short on-map tag for extrapolated (outside anchor span / hull) coordinates. */
export const EXTRAPOLATED_LOCATION_TAG = "estimated location";

/**
 * Returns the honesty suffix for a POI label, or null when no hedge is needed
 * (surveyed / unspecified non-security → no tag).
 */
export function poiLocationHonestyTag(
  poi: Pick<PoiDefinition, "category" | "precision">,
): string | null {
  if (poi.category === "security") return SECURITY_APPROX_TAG;
  if (poi.precision === "schematic") return SCHEMATIC_LOCATION_TAG;
  if (poi.precision === "extrapolated") return EXTRAPOLATED_LOCATION_TAG;
  return null;
}
