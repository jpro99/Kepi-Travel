/**
 * Traveler-observed airport facts string path — feeds Help/coach copy only.
 * Cartographer resolves a map pin ONLY when an official gate node matches;
 * never promotes a traveler mark to official FIDS or inventory.
 */

import { getAirportLayout } from "@/lib/airportNav/getLayout";
import { resolveGateNode } from "@/lib/airportNav/pathfinder";
import type { AirportCaptureRecord } from "@/lib/airportNav/airportCaptureTypes";
import { sanitizeCaptureGateString, sanitizeCaptureNote } from "@/lib/airportNav/airportCapture";

export interface TravelerObservedCartographerMatch {
  gateString: string;
  nodeId: string;
  iata: string;
}

/** Plain-text Facts line for support + coach — never claims official board data. */
export function formatTravelerObservedFactsString(
  capture: Pick<
    AirportCaptureRecord,
    "iata" | "gateString" | "note" | "mapMark" | "capturedAt" | "photoDataUrl"
  > | null | undefined,
): string | null {
  if (!capture) return null;
  const parts: string[] = [];
  const iata = capture.iata?.trim().toUpperCase();
  if (iata) parts.push(`Airport ${iata}`);
  const gate = sanitizeCaptureGateString(capture.gateString);
  if (gate) parts.push(`traveler saw gate ${gate}`);
  const note = sanitizeCaptureNote(capture.note);
  if (note) parts.push(note);
  if (
    capture.mapMark &&
    Number.isFinite(capture.mapMark.lng) &&
    Number.isFinite(capture.mapMark.lat)
  ) {
    parts.push(
      `map mark ${capture.mapMark.lat.toFixed(5)},${capture.mapMark.lng.toFixed(5)}`,
    );
  }
  if (capture.photoDataUrl?.trim()) parts.push("photo attached");
  if (parts.length === 0) return null;
  return `TRAVELER_OBSERVED: ${parts.join(" · ")}`;
}

/**
 * Cartographer join — official graph match only. No layout / no node = no pin.
 * Never fabricates gate inventory from a traveler string.
 */
export function resolveTravelerObservedCartographerMatch(
  capture: Pick<AirportCaptureRecord, "iata" | "gateString"> | null | undefined,
): TravelerObservedCartographerMatch | null {
  if (!capture) return null;
  const iata = capture.iata?.trim().toUpperCase();
  const gateString = sanitizeCaptureGateString(capture.gateString);
  if (!iata || !gateString) return null;
  const layout = getAirportLayout(iata);
  if (!layout) return null;
  const nodeId = resolveGateNode(layout, gateString);
  if (!nodeId) return null;
  return { gateString, nodeId, iata };
}
