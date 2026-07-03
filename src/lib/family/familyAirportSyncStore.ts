import "server-only";

import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import {
  emptyAirportSyncDocument,
  FAMILY_AIRPORT_SYNC_KEY,
  type FamilyAirportSyncDocument,
  type FamilyMemberJourney,
  type FamilyRally,
} from "@/lib/family/familyAirportSync";

export async function loadFamilyAirportSync(
  ownerId: string,
  tripId: string,
  groupId: string,
): Promise<FamilyAirportSyncDocument> {
  const existing = await kvStoreGet<FamilyAirportSyncDocument>(FAMILY_AIRPORT_SYNC_KEY(tripId), {
    userId: ownerId,
  });
  if (existing && existing.tripId === tripId) return existing;
  return emptyAirportSyncDocument(tripId, groupId);
}

export async function saveFamilyAirportSync(
  ownerId: string,
  doc: FamilyAirportSyncDocument,
): Promise<void> {
  await kvStoreSet(FAMILY_AIRPORT_SYNC_KEY(doc.tripId), { ...doc, updatedAt: new Date().toISOString() }, {
    userId: ownerId,
  });
}

export async function upsertMemberJourney(
  ownerId: string,
  tripId: string,
  groupId: string,
  journey: FamilyMemberJourney,
): Promise<FamilyAirportSyncDocument> {
  const doc = await loadFamilyAirportSync(ownerId, tripId, groupId);
  doc.journeys[journey.memberId] = journey;
  await saveFamilyAirportSync(ownerId, doc);
  return doc;
}

export async function setFamilyRally(
  ownerId: string,
  tripId: string,
  groupId: string,
  rally: FamilyRally | null,
): Promise<FamilyAirportSyncDocument> {
  const doc = await loadFamilyAirportSync(ownerId, tripId, groupId);
  doc.rally = rally;
  await saveFamilyAirportSync(ownerId, doc);
  return doc;
}
