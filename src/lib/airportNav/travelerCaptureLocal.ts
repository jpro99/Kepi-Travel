"use client";

import { buildTravelerCaptureRecord } from "@/lib/airportNav/travelerCapture";
import type {
  TravelerCaptureRecord,
  TravelerCaptureSubmitInput,
} from "@/lib/airportNav/travelerCaptureTypes";

const STORAGE_KEY = "kepi:traveler-capture-local:v1";

let memoryQueue: TravelerCaptureRecord[] = [];

function readQueue(): TravelerCaptureRecord[] {
  if (typeof window === "undefined") return memoryQueue;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryQueue;
    const parsed = JSON.parse(raw) as TravelerCaptureRecord[];
    const stored = Array.isArray(parsed) ? parsed : [];
    if (memoryQueue.length === 0) return stored;
    const ids = new Set(stored.map((record) => record.id));
    return [...memoryQueue.filter((record) => !ids.has(record.id)), ...stored];
  } catch {
    return memoryQueue;
  }
}

function writeQueue(records: TravelerCaptureRecord[]): void {
  memoryQueue = records.slice(0, 200);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryQueue));
  } catch {
    // localStorage blocked — memoryQueue still holds this session
  }
}

export function listLocalTravelerCaptures(tripId?: string): TravelerCaptureRecord[] {
  const records = readQueue();
  if (!tripId) return records;
  return records.filter((record) => record.tripId === tripId);
}

export function enqueueTravelerCapture(input: TravelerCaptureSubmitInput): TravelerCaptureRecord {
  const record = buildTravelerCaptureRecord(input, { syncStatus: "pending" });
  writeQueue([record, ...readQueue()]);
  return record;
}

function markSynced(id: string, synced: TravelerCaptureRecord): void {
  writeQueue(
    readQueue().map((record) =>
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

function markFailed(id: string, error: string): void {
  writeQueue(
    readQueue().map((record) =>
      record.id === id
        ? { ...record, syncStatus: "failed", lastError: error.slice(0, 240) }
        : record,
    ),
  );
}

/** Replay pending captures — call from existing page sync hooks (no separate timer). */
export async function syncPendingTravelerCaptures(): Promise<number> {
  const pending = readQueue().filter(
    (record) => record.syncStatus === "pending" || record.syncStatus === "failed",
  );
  let synced = 0;
  for (const record of pending) {
    try {
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
        }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        markFailed(record.id, payload.error ?? `Sync failed (${response.status})`);
        continue;
      }
      const saved = (await response.json()) as { capture?: TravelerCaptureRecord };
      if (saved.capture) {
        markSynced(record.id, saved.capture);
        synced += 1;
      }
    } catch (error) {
      markFailed(
        record.id,
        error instanceof Error ? error.message : "Capture sync failed",
      );
    }
  }
  return synced;
}

export async function saveTravelerCapture(
  input: TravelerCaptureSubmitInput,
): Promise<{ record: TravelerCaptureRecord; synced: boolean }> {
  const record = enqueueTravelerCapture(input);
  const syncedCount = await syncPendingTravelerCaptures();
  return { record, synced: syncedCount > 0 };
}
