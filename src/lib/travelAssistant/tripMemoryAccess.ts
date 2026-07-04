import { kvStoreGet } from "@/lib/travelAssistant/kvStore";
import { getShareRecord, getSharedTrip } from "@/lib/travelAssistant/tripShareStore";

const FAMILY_GROUPS_KEY = "family:groups:v2";
const FAMILY_MEMBERSHIP_KEY = "family:membership";

interface FamilyGroup {
  members: Array<{ id: string }>;
}

export type TripMemoryAccessRole = "owner" | "viewer" | "none";

export async function resolveOwnerFromShareToken(
  shareToken: string,
): Promise<{ ownerUserId: string; tripId: string } | null> {
  const shared = await getSharedTrip(shareToken.trim());
  if (shared.status !== "ok") return null;
  const record = await getShareRecord(shareToken.trim());
  if (!record) return null;
  return { ownerUserId: record.ownerUserId, tripId: record.tripId };
}

export async function isFamilyMemberOfTripOwner(
  memberUserId: string,
  ownerUserId: string,
): Promise<boolean> {
  if (memberUserId === ownerUserId) return true;

  const membership = await kvStoreGet<{ ownerId?: string }>(FAMILY_MEMBERSHIP_KEY, {
    userId: memberUserId,
  });
  if (membership?.ownerId === ownerUserId) return true;

  const ownerGroups = await kvStoreGet<FamilyGroup[]>(FAMILY_GROUPS_KEY, { userId: ownerUserId });
  return Boolean(ownerGroups?.some((group) => group.members.some((member) => member.id === memberUserId)));
}

export async function resolveTripMemoryAccess(args: {
  ownerUserId: string;
  tripId: string;
  requesterUserId?: string | null;
  shareToken?: string | null;
}): Promise<TripMemoryAccessRole> {
  const { ownerUserId, tripId, requesterUserId, shareToken } = args;

  if (requesterUserId && requesterUserId === ownerUserId) {
    return "owner";
  }

  if (shareToken?.trim()) {
    const shared = await getSharedTrip(shareToken.trim());
    if (shared.status === "ok" && shared.trip.id === tripId) {
      return "viewer";
    }
  }

  if (requesterUserId && (await isFamilyMemberOfTripOwner(requesterUserId, ownerUserId))) {
    return "viewer";
  }

  return "none";
}
