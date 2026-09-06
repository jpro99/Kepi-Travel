"use client";

/**
 * Traveler capture local queue — delegates to gateCaptureOutbox (Breakthrough B).
 * Keeps the original import path stable for AirportTravelerCapture.
 */

import {
  enqueueGateCapture,
  listGateCaptureOutbox,
  replayGateCaptureOutbox,
  saveGateCapture,
} from "@/lib/airportNav/gateCaptureOutbox";
import type {
  TravelerCaptureRecord,
  TravelerCaptureSubmitInput,
} from "@/lib/airportNav/travelerCaptureTypes";

export function listLocalTravelerCaptures(tripId?: string): TravelerCaptureRecord[] {
  return listGateCaptureOutbox(tripId);
}

export function enqueueTravelerCapture(input: TravelerCaptureSubmitInput): TravelerCaptureRecord {
  return enqueueGateCapture(input);
}

export async function syncPendingTravelerCaptures(): Promise<number> {
  return replayGateCaptureOutbox();
}

export async function saveTravelerCapture(
  input: TravelerCaptureSubmitInput,
): Promise<{ record: TravelerCaptureRecord; synced: boolean }> {
  return saveGateCapture(input);
}
