/**
 * Clear stranded state when a rebooked confirmation updates the remaining flight.
 */

import { flightDepartureUtcMs, type FlightSortFields } from "@/lib/travelAssistant/flightSort";
import type { StrandedFlightState } from "@/lib/travelAssistant/strandedFlightDetector";

export interface StrandedRebookClearInput {
  stranded: StrandedFlightState | null | undefined;
  reservations: readonly (FlightSortFields & { id: string })[];
  nowMs?: number;
}

/**
 * Clear stranded when:
 * - user confirmed rebook ingest, or
 * - the stranded reservation's departure moved to the future (new confirmation), or
 * - the stranded reservation id no longer exists (replaced).
 */
export function shouldClearStrandedOnRebook(input: StrandedRebookClearInput): boolean {
  const stranded = input.stranded;
  if (!stranded?.reservationId) return false;
  if (stranded.rebookConfirmedAt) return true;

  const nowMs = input.nowMs ?? Date.now();
  const match = input.reservations.find((r) => r.id === stranded.reservationId);
  if (!match) return true;

  const depMs = flightDepartureUtcMs(match);
  if (Number.isFinite(depMs) && depMs > nowMs + 30 * 60_000) {
    return true;
  }

  return false;
}

export function clearStrandedState(
  stranded: StrandedFlightState | null | undefined,
): StrandedFlightState | null {
  if (!stranded) return null;
  return null;
}

export function markStrandedRebookConfirmed(
  stranded: StrandedFlightState,
  nowIso: string = new Date().toISOString(),
): StrandedFlightState {
  return {
    ...stranded,
    confirmed: true,
    rebookConfirmedAt: nowIso,
  };
}
