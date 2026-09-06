"use client";

import { evaluateGateCorroboration } from "@/lib/airportNav/gateHarvestCorroboration";
import { normalizeVisionGateExtract } from "@/lib/airportNav/gateVisionExtract";
import { buildTravelerCaptureRecord } from "@/lib/airportNav/travelerCapture";
import {
  countPendingOutboxCaptures,
  deleteCapturePhoto,
  listOutboxCaptures,
  loadCapturePhoto,
  peekOutboxCapturesSync,
  saveCapturePhoto,
  upsertOutboxCapture,
  writeOutboxCaptures,
} from "@/lib/airportNav/travelerCaptureOutbox";
import type {
  TravelerCaptureRecord,
  TravelerCaptureSubmitInput,
} from "@/lib/airportNav/travelerCaptureTypes";
import { generateId } from "@/lib/utils/generateId";

export async function listLocalTravelerCaptures(tripId?: string): Promise<TravelerCaptureRecord[]> {
  return listOutboxCaptures(tripId);
}

export async function countPendingTravelerCaptures(): Promise<number> {
  const records = await listOutboxCaptures();
  return countPendingOutboxCaptures(records);
}

async function markSynced(id: string, synced: TravelerCaptureRecord): Promise<void> {
  const records = await listOutboxCaptures();
  await writeOutboxCaptures(
    records.map((record) =>
      record.id === id
        ? {
            ...synced,
            syncStatus: "synced",
            syncedAt: synced.syncedAt ?? new Date().toISOString(),
            lastError: null,
          }
        : record,
    ),
  );
}

async function markFailed(id: string, error: string): Promise<void> {
  const records = await listOutboxCaptures();
  await writeOutboxCaptures(
    records.map((record) =>
      record.id === id
        ? { ...record, syncStatus: "failed", lastError: error.slice(0, 240) }
        : record,
    ),
  );
}

/** Replay pending captures — foreground drain only (no Background Sync on iPhone). */
export async function syncPendingTravelerCaptures(): Promise<number> {
  const pending = (await listOutboxCaptures()).filter(
    (record) => record.syncStatus === "pending" || record.syncStatus === "failed",
  );
  let synced = 0;
  for (const record of pending) {
    try {
      const photoDataUrl = record.hasLocalPhoto ? await loadCapturePhoto(record.id) : null;
      const response = await fetch("/api/traveler-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: record.id,
          tripId: record.tripId,
          reservationId: record.reservationId,
          iata: record.iata,
          gateString: record.gateString,
          mapMark: record.mapMark,
          note: record.note,
          capturedAt: record.capturedAt,
          photoDataUrl,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        await markFailed(record.id, payload.error ?? `Sync failed (${response.status})`);
        continue;
      }
      const saved = (await response.json()) as { capture?: TravelerCaptureRecord };
      if (saved.capture) {
        await markSynced(record.id, saved.capture);
        if (record.hasLocalPhoto) {
          await deleteCapturePhoto(record.id);
        }
        synced += 1;
      }
    } catch (error) {
      await markFailed(
        record.id,
        error instanceof Error ? error.message : "Capture sync failed",
      );
    }
  }
  return synced;
}

export interface TravelerCaptureEnqueueInput extends TravelerCaptureSubmitInput {
  visionText?: string | null;
  visionConfidence?: number | null;
}

export async function enqueueTravelerCapture(
  input: TravelerCaptureEnqueueInput,
): Promise<TravelerCaptureRecord> {
  const vision = normalizeVisionGateExtract({
    text: input.visionText,
    confidence: input.visionConfidence,
    source: "vision",
  });
  const mergedInput: TravelerCaptureSubmitInput = {
    ...input,
    gateString: input.gateString ?? vision.gateString,
  };

  const opId = mergedInput.id?.trim() || generateId();
  const photoDataUrl = mergedInput.photoDataUrl?.trim() || null;
  let hasLocalPhoto = false;
  if (photoDataUrl) {
    const photoResult = await saveCapturePhoto(opId, photoDataUrl);
    hasLocalPhoto = photoResult.saved;
  }

  const record = buildTravelerCaptureRecord(
    { ...mergedInput, id: opId },
    { syncStatus: "pending", hasLocalPhoto },
  );
  await upsertOutboxCapture(record);
  return record;
}

/** Commit locally first, then best-effort sync when online. */
export async function saveTravelerCapture(
  input: TravelerCaptureEnqueueInput,
): Promise<{ record: TravelerCaptureRecord; synced: boolean }> {
  const record = await enqueueTravelerCapture(input);
  const syncedCount = await syncPendingTravelerCaptures();
  return { record, synced: syncedCount > 0 };
}

/** F19 corroboration over durable outbox — same-user re-pass OK for v1. */
export async function evaluateOutboxCorroboration(
  tripId: string,
  options?: { officialGateString?: string | null; iata?: string },
) {
  const captures = await listOutboxCaptures(tripId);
  return evaluateGateCorroboration(captures, options);
}

/** Sync peek for Help Facts — call listLocalTravelerCaptures() once on mount to hydrate cache. */
export function listLocalTravelerCapturesSync(tripId?: string): TravelerCaptureRecord[] {
  return peekOutboxCapturesSync(tripId);
}
