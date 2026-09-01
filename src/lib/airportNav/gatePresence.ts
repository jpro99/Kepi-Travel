/**
 * Gate HUD helpers — big readable gate, change alerts, and "you're here" arrival.
 * KEPI_DESIGN_LAW M16 (gate pulse + guide) companion.
 */

import { metersBetween } from "@/lib/airportNav/directionArrow";

/** Within this distance of the gate node, treat the traveler as arrived. */
export const AT_GATE_METERS = 35;

export function distanceToGateMeters(
  userPos: [number, number] | null | undefined,
  gatePos: [number, number] | null | undefined,
): number | null {
  if (!userPos || !gatePos) return null;
  if (!Number.isFinite(userPos[0]) || !Number.isFinite(userPos[1])) return null;
  if (!Number.isFinite(gatePos[0]) || !Number.isFinite(gatePos[1])) return null;
  return metersBetween(userPos, gatePos);
}

export function isAtBookedGate(distanceM: number | null | undefined): boolean {
  return typeof distanceM === "number" && Number.isFinite(distanceM) && distanceM <= AT_GATE_METERS;
}

export type GateArrivalBanner =
  | { kind: "at_gate_on_time"; label: string }
  | { kind: "at_gate_delayed"; label: string }
  | null;

/** Flashing "You're here" copy once the traveler reaches the booked gate. */
export function gateArrivalBanner(args: {
  atGate: boolean;
  gateCode: string | null | undefined;
  delayed?: boolean | null;
}): GateArrivalBanner {
  if (!args.atGate) return null;
  const gate = args.gateCode?.trim().toUpperCase();
  const gateBit = gate ? `Gate ${gate}` : "your gate";
  if (args.delayed) {
    return { kind: "at_gate_delayed", label: `You're here · ${gateBit} · flight delayed` };
  }
  return { kind: "at_gate_on_time", label: `You're here · ${gateBit} · on time` };
}

/** Human copy when the booked gate assignment changes. */
export function gateChangeBanner(
  previousGate: string | null | undefined,
  nextGate: string | null | undefined,
): string | null {
  const prev = previousGate?.trim().toUpperCase() || null;
  const next = nextGate?.trim().toUpperCase() || null;
  if (!next || prev === next) return null;
  if (!prev) return `Gate assigned · ${next}`;
  return `Gate changed · ${prev} → ${next}`;
}

/**
 * Departures: keep walk-to-gate guidance on until the traveler reaches the gate.
 * Arrival first-mile (Leonardo rail, etc.) stays map-first — no auto gate walk.
 */
export function shouldPersistGateWalk(input: {
  previewMode: boolean;
  isArriveCoach: boolean;
  mapFirstLiveArrivalFirstMile: boolean;
  atGate: boolean;
  gateAssigned: boolean;
}): boolean {
  if (input.previewMode || input.isArriveCoach || input.atGate || !input.gateAssigned) return false;
  if (input.mapFirstLiveArrivalFirstMile) return false;
  return true;
}

/** True when we should (re)start routing to the booked gate now. */
export function shouldStartGateWalkNow(input: {
  persist: boolean;
  quietMode: boolean;
  confirmMode: boolean;
  credentialsKnown: boolean;
  hasOrigin: boolean;
  activeRouteToGate: boolean;
  routingElsewhere: boolean;
}): boolean {
  if (!input.persist || !input.hasOrigin) return false;
  if (input.quietMode || input.confirmMode) return false;
  if (!input.credentialsKnown) return false;
  if (input.activeRouteToGate || input.routingElsewhere) return false;
  return true;
}
