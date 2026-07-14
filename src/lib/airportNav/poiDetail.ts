/**
 * Zoom-tiered POI detail + license-safe airline branding (KEPI_DESIGN_LAW M22).
 *
 * Pure helpers, shared by the live airport map component and its tests. Kept out
 * of the component so they can be unit-tested without a DOM / MapLibre.
 */
import type { PoiCategory, PoiDefinition } from "./types";

/**
 * Progressive-detail zoom tiers: terminal/zone shapes are always visible; major
 * anchors (gates, security, lounges, train) appear at a middle zoom; the
 * counter-/door-level detail (individual airline check-in counters, restrooms)
 * only appears once zoomed in close — like a real airport map. A per-POI
 * `minZoomToShow` overrides the category default.
 */
export const POI_ZOOM_TIER: Record<PoiCategory, number> = {
  gate: 13.5,
  security: 13.5,
  train: 13.5,
  lounge: 14,
  baggage: 14,
  checkin: 15,
  restroom: 15.5,
};

export function poiMinZoom(poi: PoiDefinition): number {
  return typeof poi.minZoomToShow === "number" ? poi.minZoomToShow : POI_ZOOM_TIER[poi.category];
}

/** True when this POI should render at the given map zoom (tier gate only). */
export function poiPassesZoom(poi: PoiDefinition, zoom: number): boolean {
  return zoom >= poiMinZoom(poi);
}

/**
 * License-safe airline branding. We never hotlink or copy a map vendor's logo
 * tiles. When a license-cleared asset has been committed under
 * `/airline-logos/{code}.svg` (its IATA code registered in
 * `AVAILABLE_AIRLINE_LOGOS`) we use it; otherwise callers fall back to a
 * Kepi-generated code chip / plain text — never a broken image.
 */
export const AVAILABLE_AIRLINE_LOGOS = new Set<string>();

export function airlineLogoAsset(poi: PoiDefinition): string | null {
  if (poi.logoUrl) return poi.logoUrl;
  const code = poi.airlineIataCode?.toUpperCase();
  if (code && AVAILABLE_AIRLINE_LOGOS.has(code)) return `/airline-logos/${code.toLowerCase()}.svg`;
  return null;
}
