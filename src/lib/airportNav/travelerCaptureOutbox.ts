"use client";

/**
 * Durable traveler-capture outbox — IndexedDB (not localStorage).
 * iPhone has no Background Sync; foreground drain on online / visibilitychange.
 * Idempotent op IDs: client-generated capture id is the primary key.
 */

import type { TravelerCaptureRecord } from "@/lib/airportNav/travelerCaptureTypes";

export const TRAVELER_CAPTURE_DB_NAME = "kepi-traveler-capture";
export const TRAVELER_CAPTURE_DB_VERSION = 1;
export const TRAVELER_CAPTURE_STORE = "captures";
export const TRAVELER_CAPTURE_PHOTO_STORE = "capture-photos";

const LEGACY_LOCAL_KEY = "kepi:traveler-capture-local:v1";
const MAX_CAPTURES = 200;
const MAX_PHOTO_BYTES = 280_000;

export interface TravelerCapturePhotoBlob {
  captureId: string;
  dataUrl: string;
  byteLength: number;
  savedAt: string;
}

function openCaptureDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(TRAVELER_CAPTURE_DB_NAME, TRAVELER_CAPTURE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRAVELER_CAPTURE_STORE)) {
        db.createObjectStore(TRAVELER_CAPTURE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TRAVELER_CAPTURE_PHOTO_STORE)) {
        db.createObjectStore(TRAVELER_CAPTURE_PHOTO_STORE, { keyPath: "captureId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open capture database"));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

let memoryCaptures: TravelerCaptureRecord[] = [];
let memoryPhotos = new Map<string, TravelerCapturePhotoBlob>();
let legacyMigrated = false;

function sortCaptures(records: TravelerCaptureRecord[]): TravelerCaptureRecord[] {
  return records
    .slice()
    .sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt))
    .slice(0, MAX_CAPTURES);
}

function migrateLegacyLocalStorage(): TravelerCaptureRecord[] {
  if (legacyMigrated || typeof window === "undefined") return [];
  legacyMigrated = true;
  try {
    const raw = localStorage.getItem(LEGACY_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TravelerCaptureRecord[];
    if (!Array.isArray(parsed)) return [];
    localStorage.removeItem(LEGACY_LOCAL_KEY);
    return parsed;
  } catch {
    return [];
  }
}

export async function listOutboxCaptures(tripId?: string): Promise<TravelerCaptureRecord[]> {
  if (typeof indexedDB === "undefined") {
    const records = memoryCaptures;
    return tripId ? records.filter((row) => row.tripId === tripId) : records;
  }

  const legacy = migrateLegacyLocalStorage();
  const db = await openCaptureDb();
  try {
    const tx = db.transaction(TRAVELER_CAPTURE_STORE, "readonly");
    const all = await idbRequest(tx.objectStore(TRAVELER_CAPTURE_STORE).getAll());
    const merged = sortCaptures([
      ...legacy.filter((row) => !all.some((stored) => stored.id === row.id)),
      ...(all as TravelerCaptureRecord[]),
    ]);
    if (legacy.length > 0) {
      await writeOutboxCaptures(merged);
    }
    memoryCaptures = merged;
    return tripId ? merged.filter((row) => row.tripId === tripId) : merged;
  } finally {
    db.close();
  }
}

export async function writeOutboxCaptures(records: TravelerCaptureRecord[]): Promise<void> {
  const trimmed = sortCaptures(records);
  memoryCaptures = trimmed;
  if (typeof indexedDB === "undefined") return;

  const db = await openCaptureDb();
  try {
    const tx = db.transaction(TRAVELER_CAPTURE_STORE, "readwrite");
    const store = tx.objectStore(TRAVELER_CAPTURE_STORE);
    const existing = await idbRequest(store.getAllKeys());
    for (const key of existing) {
      if (!trimmed.some((row) => row.id === key)) {
        store.delete(key);
      }
    }
    for (const record of trimmed) {
      store.put(record);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to write capture outbox"));
    });
  } finally {
    db.close();
  }
}

export async function upsertOutboxCapture(record: TravelerCaptureRecord): Promise<void> {
  const existing = await listOutboxCaptures();
  const withoutDup = existing.filter((row) => row.id !== record.id);
  await writeOutboxCaptures([record, ...withoutDup]);
}

export async function saveCapturePhoto(
  captureId: string,
  dataUrl: string,
): Promise<{ saved: boolean; tooLarge: boolean }> {
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith("data:image/")) {
    return { saved: false, tooLarge: false };
  }
  const byteLength = Math.ceil((trimmed.length * 3) / 4);
  if (byteLength > MAX_PHOTO_BYTES) {
    return { saved: false, tooLarge: true };
  }

  const blob: TravelerCapturePhotoBlob = {
    captureId,
    dataUrl: trimmed,
    byteLength,
    savedAt: new Date().toISOString(),
  };
  memoryPhotos.set(captureId, blob);

  if (typeof indexedDB === "undefined") {
    return { saved: true, tooLarge: false };
  }

  const db = await openCaptureDb();
  try {
    const tx = db.transaction(TRAVELER_CAPTURE_PHOTO_STORE, "readwrite");
    tx.objectStore(TRAVELER_CAPTURE_PHOTO_STORE).put(blob);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save capture photo"));
    });
    return { saved: true, tooLarge: false };
  } finally {
    db.close();
  }
}

export async function loadCapturePhoto(captureId: string): Promise<string | null> {
  const cached = memoryPhotos.get(captureId);
  if (cached) return cached.dataUrl;

  if (typeof indexedDB === "undefined") return null;

  const db = await openCaptureDb();
  try {
    const tx = db.transaction(TRAVELER_CAPTURE_PHOTO_STORE, "readonly");
    const row = await idbRequest(
      tx.objectStore(TRAVELER_CAPTURE_PHOTO_STORE).get(captureId),
    );
    if (!row || typeof row !== "object") return null;
    const photo = row as TravelerCapturePhotoBlob;
    memoryPhotos.set(captureId, photo);
    return photo.dataUrl;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function deleteCapturePhoto(captureId: string): Promise<void> {
  memoryPhotos.delete(captureId);
  if (typeof indexedDB === "undefined") return;
  const db = await openCaptureDb();
  try {
    const tx = db.transaction(TRAVELER_CAPTURE_PHOTO_STORE, "readwrite");
    tx.objectStore(TRAVELER_CAPTURE_PHOTO_STORE).delete(captureId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to delete capture photo"));
    });
  } finally {
    db.close();
  }
}

export function countPendingOutboxCaptures(records: TravelerCaptureRecord[]): number {
  return records.filter(
    (record) => record.syncStatus === "pending" || record.syncStatus === "failed",
  ).length;
}

/** In-memory peek after at least one async listOutboxCaptures() in this session. */
export function peekOutboxCapturesSync(tripId?: string): TravelerCaptureRecord[] {
  const records = memoryCaptures;
  return tripId ? records.filter((row) => row.tripId === tripId) : records;
}
