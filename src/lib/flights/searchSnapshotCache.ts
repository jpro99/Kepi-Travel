import { kvStoreDel, kvStoreGet, kvStoreList, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";
import type { AlaskaUpgradeCandidate, CabinClass, OriginAwardRow, OriginCashRow } from "./types";

/**
 * Browse-without-re-searching cache for the recent-searches list. Deliberately separate from
 * flightCache.ts's 3min/30min live-price cache — that one stays short-lived for price accuracy,
 * this one is long-lived so a user can revisit what they found without paying for a fresh
 * multi-airport search every time.
 */
export const SEARCH_SNAPSHOT_TTL_SECONDS = 60 * 60 * 36; // 36h

const SNAPSHOT_KEY_PREFIX = "flights:searchSnapshot:";

export interface SearchSnapshot {
  id: string;
  createdAt: number;
  expiresAt: number;
  prompt: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  cabin: CabinClass;
  originCashLeaderboard: OriginCashRow[];
  originAwardLeaderboard: OriginAwardRow[];
  alaskaUpgradeCandidates?: AlaskaUpgradeCandidate[];
  headline?: string;
}

function snapshotKey(id: string): string {
  return `${SNAPSHOT_KEY_PREFIX}${id}`;
}

export async function saveSearchSnapshot(
  userId: string,
  snapshot: Omit<SearchSnapshot, "id" | "createdAt" | "expiresAt">,
): Promise<string> {
  const id = generateId();
  const now = Date.now();
  const full: SearchSnapshot = {
    ...snapshot,
    id,
    createdAt: now,
    expiresAt: now + SEARCH_SNAPSHOT_TTL_SECONDS * 1000,
  };
  await kvStoreSet(snapshotKey(id), full, { userId });
  return id;
}

export async function listRecentSearchSnapshots(userId: string, limit = 10): Promise<SearchSnapshot[]> {
  const entries = await kvStoreList<SearchSnapshot>(SNAPSHOT_KEY_PREFIX, { userId, limit: limit * 2 });
  const now = Date.now();
  const fresh: SearchSnapshot[] = [];
  for (const entry of entries) {
    if (!entry.value) continue;
    if (entry.value.expiresAt <= now) {
      void kvStoreDel(entry.key, { userId }).catch(() => {});
      continue;
    }
    fresh.push(entry.value);
  }
  return fresh.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function getSearchSnapshot(userId: string, id: string): Promise<SearchSnapshot | null> {
  const snapshot = await kvStoreGet<SearchSnapshot>(snapshotKey(id), { userId });
  if (!snapshot || snapshot.expiresAt <= Date.now()) return null;
  return snapshot;
}
