/**
 * Gate STRING path — push / FIDS / boarding OCR / booked confirmation only.
 * Map DOT via gateNodeResolver longest-prefix; no match = no DOT (never invent).
 */

import { resolveGateNode } from "@/lib/airportNav/pathfinder";
import type { AirportLayout } from "@/lib/airportNav/types";
import { normalizeGateString } from "@/lib/travelAssistant/bookedRemainingGateStation";
import {
  resolveGateDoor,
  type FlightFactProvenance,
} from "@/lib/travelAssistant/dayOfDoorProvenance";

export interface GateStringSources {
  pushGate?: string | null;
  liveGate?: string | null;
  bookedGate?: string | null;
  boardingOcrGate?: string | null;
  travelerObservedGate?: string | null;
  departureIata?: string | null;
}

export interface GateStringResolution {
  gateString: string | null;
  provenance: FlightFactProvenance;
  /** Resolved map node when layout join succeeds. */
  mapNodeId: string | null;
  coachCopy: string | null;
}

export function pickGateStringFromSources(sources: GateStringSources): {
  gateString: string | null;
  provenance: FlightFactProvenance;
} {
  const door = resolveGateDoor({
    pushGate: sources.pushGate,
    liveGate: sources.liveGate ?? sources.boardingOcrGate,
    bookedGate: sources.bookedGate,
    departureIata: sources.departureIata,
  });
  const gateString = normalizeGateString(
    sources.pushGate ??
      sources.liveGate ??
      sources.boardingOcrGate ??
      sources.bookedGate ??
      null,
  );
  return {
    gateString: gateString || null,
    provenance: door.provenance,
  };
}

export function resolveGateStringForLayout(
  layout: AirportLayout | null | undefined,
  sources: GateStringSources,
): GateStringResolution {
  const picked = pickGateStringFromSources(sources);
  const gateString = picked.gateString;
  if (!gateString) {
    return {
      gateString: null,
      provenance: picked.provenance,
      mapNodeId: null,
      coachCopy: null,
    };
  }

  const mapNodeId = layout ? resolveGateNode(layout, gateString) : null;
  const coachCopy =
    mapNodeId == null
      ? `Gate ${gateString} — follow airport screens; map pin unavailable until we can join this gate to the terminal graph.`
      : null;

  return {
    gateString,
    provenance: picked.provenance,
    mapNodeId,
    coachCopy,
  };
}

/** Traveler-observed gate is Facts-adjacent only — never promotes to official gate DOT. */
export function gateStringForMapDot(sources: GateStringSources): string | null {
  const official = pickGateStringFromSources(sources);
  return official.gateString;
}
