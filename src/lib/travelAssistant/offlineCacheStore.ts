import {
  OFFLINE_KIT_DB_NAME,
  OFFLINE_KIT_DB_VERSION,
} from "@/lib/travelAssistant/offlineTravelKit";
import type { OfflineCacheKind } from "@/lib/travelAssistant/itineraryOfflineCache";

export const OFFLINE_CACHE_STORE = "offline-cache";

export interface OfflineCacheRecord {
  key: string;
  kind: OfflineCacheKind;
  tripId: string;
  savedAt: string;
  payload: unknown;
}

function openOfflineCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(OFFLINE_KIT_DB_NAME, OFFLINE_KIT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("travel-kit")) {
        db.createObjectStore("travel-kit");
      }
      if (!db.objectStoreNames.contains(OFFLINE_CACHE_STORE)) {
        db.createObjectStore(OFFLINE_CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open offline cache database"));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export async function saveOfflineCacheRecord(record: OfflineCacheRecord): Promise<void> {
  const db = await openOfflineCacheDb();
  try {
    const tx = db.transaction(OFFLINE_CACHE_STORE, "readwrite");
    tx.objectStore(OFFLINE_CACHE_STORE).put(record, record.key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save offline cache record"));
    });
  } finally {
    db.close();
  }
}

export async function loadOfflineCacheRecord(key: string): Promise<OfflineCacheRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openOfflineCacheDb();
  try {
    const tx = db.transaction(OFFLINE_CACHE_STORE, "readonly");
    const value = await idbRequest(tx.objectStore(OFFLINE_CACHE_STORE).get(key));
    if (!value || typeof value !== "object") return null;
    return value as OfflineCacheRecord;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function deleteOfflineCacheRecord(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openOfflineCacheDb();
  try {
    const tx = db.transaction(OFFLINE_CACHE_STORE, "readwrite");
    tx.objectStore(OFFLINE_CACHE_STORE).delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to delete offline cache record"));
    });
  } finally {
    db.close();
  }
}

export async function listOfflineCacheKeys(): Promise<string[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openOfflineCacheDb();
  try {
    const tx = db.transaction(OFFLINE_CACHE_STORE, "readonly");
    return await idbRequest(tx.objectStore(OFFLINE_CACHE_STORE).getAllKeys()) as string[];
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function evictOfflineCacheExcept(allowedKeys: Set<string>): Promise<string[]> {
  const existing = await listOfflineCacheKeys();
  const removed: string[] = [];
  for (const key of existing) {
    if (!allowedKeys.has(key)) {
      await deleteOfflineCacheRecord(key);
      removed.push(key);
    }
  }
  return removed;
}
