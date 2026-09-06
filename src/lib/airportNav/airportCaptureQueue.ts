"use client";

import type { AirportCaptureRecord, AirportCaptureSubmitInput } from "@/lib/airportNav/airportCaptureTypes";
import { buildLocalAirportCaptureRecord } from "@/lib/airportNav/airportCapture";

const STORAGE_KEY = "kepi:airport-capture-queue:v1";

/** In-memory fallback when localStorage is blocked — survives until tab close. */
let memoryQueue: AirportCaptureRecord[] = [];

function readQueue(): AirportCaptureRecord[] {
  if (typeof window === "undefined") return memoryQueue;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryQueue;
    const parsed = JSON.parse(raw) as AirportCaptureRecord[];
    const stored = Array.isArray(parsed) ? parsed : [];
    if (memoryQueue.length > 0) {
      const ids = new Set(stored.map((record) => record.id));
      const merged = [...memoryQueue.filter((record) => !ids.has(record.id)), ...stored];
      return merged;
    }
    return stored;
  } catch {
    return memoryQueue;
  }
}

function writeQueue(records: AirportCaptureRecord[]): void {
  memoryQueue = records.slice(0, 200);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryQueue));
  } catch {
    // localStorage may be blocked — memoryQueue still holds captures this session
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
          photoDataUrl: record.photoDataUrl,
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

/** Enqueue locally then attempt immediate sync — safe when Home/poll is frozen. */
export async function enqueueAndSyncAirportCapture(
  input: AirportCaptureSubmitInput,
): Promise<{ record: AirportCaptureRecord; synced: boolean }> {
  const record = enqueueAirportCapture(input);
  const syncedCount = await syncPendingAirportCaptures();
  return { record, synced: syncedCount > 0 };
}

type SyncListener = () => void;

let syncInstalled = false;
let globalSyncCleanup: (() => void) | null = null;
const syncListeners = new Set<SyncListener>();

export function onAirportCaptureQueueChange(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

function notifyQueueChange(): void {
  syncListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // listener errors must not break capture
    }
  });
}

function runBackgroundSync(): void {
  void syncPendingAirportCaptures().then((count) => {
    if (count > 0) notifyQueueChange();
  });
}

function ensureGlobalSyncHooks(): void {
  if (syncInstalled || typeof window === "undefined") return;
  syncInstalled = true;
  runBackgroundSync();

  const onVisible = () => {
    if (document.visibilityState === "visible") runBackgroundSync();
  };
  const onOnline = () => runBackgroundSync();

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  const timer = window.setInterval(runBackgroundSync, 120_000);

  globalSyncCleanup = () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    window.clearInterval(timer);
    syncInstalled = false;
    globalSyncCleanup = null;
  };
}

/** Idempotent — installs online + visibility sync hooks once per tab. */
export function installAirportCaptureSync(onChange?: SyncListener): () => void {
  ensureGlobalSyncHooks();
  if (!onChange) return () => undefined;
  return onAirportCaptureQueueChange(onChange);
}
