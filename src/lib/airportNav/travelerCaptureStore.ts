import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import type { TravelerCaptureRecord } from "@/lib/airportNav/travelerCaptureTypes";
import { generateId } from "@/lib/utils/generateId";

const NS = "__traveler-capture-system__";
const CAPTURE_PREFIX = "traveler-capture:v1/";
const TRIP_INDEX_PREFIX = "traveler-capture-trip:v1/";
const MAX_TRIP_CAPTURES = 120;

function captureKey(id: string): string {
  return `${CAPTURE_PREFIX}${id}`;
}

function tripIndexKey(tripId: string): string {
  return `${TRIP_INDEX_PREFIX}${tripId}`;
}

export async function saveTravelerCaptureRecord(
  record: TravelerCaptureRecord,
): Promise<TravelerCaptureRecord> {
  const id = record.id?.trim() || generateId();
  const stored: TravelerCaptureRecord = {
    ...record,
    id,
    syncStatus: "synced",
    syncedAt: new Date().toISOString(),
    lastError: null,
  };
  await kvStoreSet(captureKey(id), stored, { userId: NS });
  const indexKey = tripIndexKey(stored.tripId);
  const existing = (await kvStoreGet<string[]>(indexKey, { userId: NS })) ?? [];
  const next = [id, ...existing.filter((entry) => entry !== id)].slice(0, MAX_TRIP_CAPTURES);
  await kvStoreSet(indexKey, next, { userId: NS });
  return stored;
}

export async function listTravelerCapturesForTrip(tripId: string): Promise<TravelerCaptureRecord[]> {
  const index = (await kvStoreGet<string[]>(tripIndexKey(tripId), { userId: NS })) ?? [];
  const captures: TravelerCaptureRecord[] = [];
  for (const id of index) {
    const record = await kvStoreGet<TravelerCaptureRecord>(captureKey(id), { userId: NS });
    if (record) captures.push(record);
  }
  return captures.sort(
    (left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt),
  );
}
