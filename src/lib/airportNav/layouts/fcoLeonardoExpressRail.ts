/**
 * Leonardo Express corridor — OSM railway=rail geometry (not a crow-flies chord).
 * Source: Overpass 2026-08-28, bbox 41.78–41.92 / 12.22–12.52, 25 m endpoint merge,
 * path Fiumicino Aeroporto (node 1313285473) → Roma Termini (node 251904108), ~32.4 km.
 * Map data © OpenStreetMap contributors, ODbL.
 */
import raw from "./fcoLeonardoExpressRail.json";
import type { RegionalRailPolyline } from "../types";

export const FCO_LEONARDO_EXPRESS_RAIL: RegionalRailPolyline = {
  id: raw.id,
  name: raw.name,
  source: raw.source,
  coordinates: raw.coordinates as [number, number][],
};
