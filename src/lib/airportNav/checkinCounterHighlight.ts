/**
 * Resolve the traveler's airline check-in counter on the indoor map (M70).
 */

import type { AirportLayout, PoiDefinition } from "./types";
import { metersBetween } from "./directionArrow";

export type CheckinCounterHighlight = {
  poi: PoiDefinition;
  pos: [number, number];
  deskLabel: string;
};

function airlineTokens(airlineName?: string | null, flightNumber?: string | null): string[] {
  const tokens: string[] = [];
  const name = airlineName?.trim().toLowerCase() ?? "";
  if (name) tokens.push(name);
  const flight = flightNumber?.trim().toUpperCase() ?? "";
  const iataPrefix = /^([A-Z0-9]{2})\d/.exec(flight)?.[1];
  if (iataPrefix) tokens.push(iataPrefix.toLowerCase());
  return tokens;
}

function poiMatchesAirline(poi: PoiDefinition, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const airline = poi.airline?.trim().toLowerCase() ?? "";
  const code = poi.airlineIataCode?.trim().toLowerCase() ?? "";
  return tokens.some((token) => {
    if (token.length === 2 && code === token) return true;
    if (airline && (airline.includes(token) || token.includes(airline))) return true;
    return false;
  });
}

export function resolveAirlineCheckinCounter(
  layout: AirportLayout | null | undefined,
  airlineName?: string | null,
  flightNumber?: string | null,
): CheckinCounterHighlight | null {
  if (!layout) return null;
  const tokens = airlineTokens(airlineName, flightNumber);
  if (tokens.length === 0) return null;

  const numbered = layout.pois.filter(
    (poi) => poi.category === "checkin" && poi.doorLabel?.trim(),
  );
  const match =
    numbered.find((poi) => poiMatchesAirline(poi, tokens))
    ?? numbered.find((poi) => poi.airline && poiMatchesAirline(poi, tokens));

  if (!match?.doorLabel?.trim()) return null;
  const node = layout.nodes.find((entry) => entry.id === match.nodeId);
  if (!node) return null;

  return {
    poi: match,
    pos: node.pos,
    deskLabel: match.doorLabel.trim(),
  };
}

export function distanceToCheckinCounterMeters(
  userPos: [number, number] | null,
  counterPos: [number, number] | null,
): number | null {
  if (!userPos || !counterPos) return null;
  return metersBetween(userPos, counterPos);
}

export function formatCheckinCounterDistance(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 25) return "nearby";
  if (meters < 1000) return `~${Math.round(meters)} m`;
  return `~${(meters / 1000).toFixed(1)} km`;
}
