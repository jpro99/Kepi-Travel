/**
 * Gate-change station — booked remaining flight only. Push when the gate STRING
 * moves. Map DOT uses gateNodeResolver longest-prefix join (separate module).
 * Never polls the live map; flight-status lookup is the station input.
 */

import { resolveGateNode } from "@/lib/airportNav/pathfinder";
import type { AirportLayout } from "@/lib/airportNav/types";
import {
  isBookedRemainingFlightLookup,
  normalizeFlightNumber,
  selectRemainingJourneyFlight,
} from "@/lib/travelAssistant/remainingJourneyFlight";
import type { FlightSortFields } from "@/lib/travelAssistant/flightSort";
import { shouldPollFlightStatus } from "@/lib/travelAssistant/flightStatusCadence";
import { flightDepartureUtcMs } from "@/lib/travelAssistant/flightSort";

export interface GateStringSnapshot {
  gate: string;
  flightNumber: string;
  flightDate: string;
}

export function normalizeGateString(gate: string | null | undefined): string {
  return (gate ?? "").trim().toUpperCase();
}

/** Gate STRING changed — empty→assigned is assignment, not a push (G26). */
export function detectBookedGateStringChange(
  previousGate: string | null | undefined,
  nextGate: string | null | undefined,
): { from: string; to: string } | null {
  const prev = normalizeGateString(previousGate);
  const next = normalizeGateString(nextGate);
  if (!prev || !next || prev === next) return null;
  return { from: prev, to: next };
}

export function shouldPollBookedRemainingGate<T extends FlightSortFields>(
  reservations: readonly T[],
  nowMs: number = Date.now(),
): boolean {
  const remaining = selectRemainingJourneyFlight(reservations, nowMs);
  if (!remaining) return false;
  const depMs = flightDepartureUtcMs(remaining);
  return shouldPollFlightStatus(depMs, nowMs);
}

/**
 * Map gate DOT — longest-prefix join via gateNodeResolver only.
 * No match = no DOT (coach copy may still mention the gate string).
 */
export function resolveBookedGateDot(
  layout: AirportLayout | null | undefined,
  gateCode: string | null | undefined,
): { nodeId: string; gateString: string } | null {
  if (!layout) return null;
  const gateString = normalizeGateString(gateCode);
  if (!gateString) return null;
  const nodeId = resolveGateNode(layout, gateString);
  if (!nodeId) return null;
  return { nodeId, gateString };
}

export function gateCoachCopy(
  gateCode: string | null | undefined,
  layout: AirportLayout | null | undefined,
): string | null {
  const gateString = normalizeGateString(gateCode);
  if (!gateString) return null;
  if (resolveBookedGateDot(layout, gateString)) return null;
  return `Gate ${gateString} — follow airport screens; map pin unavailable until we can join this gate to the terminal graph.`;
}

export function matchesRemainingGateStation<T extends FlightSortFields>(
  reservations: readonly T[],
  input: { flightNumber: string; flightDate: string },
  nowMs: number = Date.now(),
): boolean {
  return isBookedRemainingFlightLookup(
    reservations,
    input.flightNumber,
    input.flightDate,
    nowMs,
  );
}

export function remainingGateSnapshot<T extends FlightSortFields>(
  reservations: readonly T[],
  gate: string | null | undefined,
  nowMs: number = Date.now(),
): GateStringSnapshot | null {
  const remaining = selectRemainingJourneyFlight(reservations, nowMs);
  if (!remaining?.flightNumber) return null;
  const flightDate =
    remaining.flightDepartureTime?.trim().slice(0, 10) ??
    remaining.flightDate?.trim().slice(0, 10) ??
    remaining.localTime?.trim().slice(0, 10) ??
    "";
  if (!flightDate) return null;
  return {
    gate: normalizeGateString(gate),
    flightNumber: normalizeFlightNumber(remaining.flightNumber),
    flightDate,
  };
}
