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
  customs: 13.5,
  lounge: 14,
  baggage: 14,
  ground_transport: 14,
  checkin: 14.4,
  restroom: 15.5,
  amenity: 15,
};

export function poiMinZoom(poi: PoiDefinition): number {
  return typeof poi.minZoomToShow === "number" ? poi.minZoomToShow : POI_ZOOM_TIER[poi.category];
}

/** True when this POI should render at the given map zoom (tier gate only). */
export function poiPassesZoom(poi: PoiDefinition, zoom: number): boolean {
  return zoom >= poiMinZoom(poi);
}

/**
 * License-safe airline branding. We never hotlink or copy a *map vendor's*
 * (e.g. Atrius) rendered logo tiles. The blessed logo source is **Duffel** —
 * Kepi is a Duffel customer, and Duffel serves 600+ brand-compliant airline
 * logos from its public CDN keyed purely by IATA code, provided precisely for
 * building travel apps (https://duffel.com/docs/api/airlines/schema). The image
 * URLs need no token; the app only needs `assets.duffel.com` allowed in CSP
 * `img-src`. If a logo 404s (airline Duffel lacks), the UI's `onerror` swaps to
 * a Kepi-generated code chip / plain text — never a broken image.
 */
export const DUFFEL_AIRLINE_LOGO_BASE = "https://assets.duffel.com/img/airlines/for-light-background";

/** Duffel brand-compliant logo URL. `symbol` = logomark only; `lockup` = symbol + name. */
export function duffelAirlineLogoUrl(iataCode: string, variant: "symbol" | "lockup" = "symbol"): string {
  const code = iataCode.trim().toUpperCase();
  const folder = variant === "lockup" ? "full-color-lockup" : "full-color-logo";
  return `${DUFFEL_AIRLINE_LOGO_BASE}/${folder}/${code}.svg`;
}

/**
 * Local logo overrides: IATA codes with a license-cleared asset committed under
 * `public/airline-logos/{code}.svg`. Takes precedence over the Duffel CDN when
 * we want a specific asset; usually empty (Duffel covers the field).
 */
export const AVAILABLE_AIRLINE_LOGOS = new Set<string>();

export function airlineLogoAsset(poi: PoiDefinition, variant: "symbol" | "lockup" = "symbol"): string | null {
  if (poi.logoUrl) return poi.logoUrl;
  const code = poi.airlineIataCode?.toUpperCase();
  if (!code) return null;
  if (AVAILABLE_AIRLINE_LOGOS.has(code)) return `/airline-logos/${code.toLowerCase()}.svg`;
  return duffelAirlineLogoUrl(code, variant);
}
