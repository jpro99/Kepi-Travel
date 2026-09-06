"use client";

import type { AirportCaptureRecord, AirportCaptureSubmitInput } from "@/lib/airportNav/airportCaptureTypes";
import { buildLocalAirportCaptureRecord } from "@/lib/airportNav/airportCapture";

const STORAGE_KEY = "kepi:airport-capture-queue:v1";

function readQueue(): AirportCaptureRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AirportCaptureRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(records: AirportCaptureRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, 200)));
  } catch {
    // localStorage may be blocked — capture still works for this session via memory
  }
}

export function listLocalAirportCaptures(tripId?: string): AirportCaptureRecord[] {
  const records = readQueue();
  if (!tripId) return records;
  return records.filter((record) => record.tripId === tripId);
}

export function enqueueAirportCapture(input: AirportCaptureSubmitInput): AirportCaptureRecord {
  const record = buildLocalAirportCaptureRecord(input, { syncStatus: "pending" });
  const queue = readQueue();
  writeQueue([record, ...queue]);
  return record;
}

export function markAirportCaptureSynced(id: string, synced: AirportCaptureRecord): void {
  const queue = readQueue().map((record) =>
    record.id === id
      ? {
          ...synced,
          syncStatus: "synced",
          syncedAt: synced.syncedAt ?? new Date().toISOString(),
          lastError: null,
        }
      : record,
  );
  writeQueue(queue);
}

export function markAirportCaptureFailed(id: string, error: string): void {
  const queue = readQueue().map((record) =>
    record.id === id
      ? {
          ...record,
          syncStatus: "failed",
          lastError: error.slice(0, 240),
        }
      : record,
  );
  writeQueue(queue);
}

export async function syncPendingAirportCaptures(): Promise<number> {
  const pending = readQueue().filter(
    (record) => record.syncStatus === "pending" || record.syncStatus === "failed",
  );
  let synced = 0;
  for (const record of pending) {
    try {
      const response = await fetch("/api/airport-capture", {
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
        markAirportCaptureFailed(record.id, payload.error ?? `Sync failed (${response.status})`);
        continue;
      }
      const saved = (await response.json()) as { capture?: AirportCaptureRecord };
      if (saved.capture) {
        markAirportCaptureSynced(record.id, saved.capture);
        synced += 1;
      }
    } catch (error) {
      markAirportCaptureFailed(
        record.id,
        error instanceof Error ? error.message : "Capture sync failed",
      );
    }
  }
  return synced;
}
