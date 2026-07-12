import { kvStoreDel, kvStoreGet, kvStoreList, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { getTrip, type TravelTrip } from "@/lib/travelAssistant/tripStore";
import { getShareRecord } from "@/lib/travelAssistant/tripShareStore";
import { userHasProAccess } from "@/lib/billing/planGate";

const COLLAB_NAMESPACE = "trip-collab";
const USER_INDEX_PREFIX = "by-user:";

export type TripCollaboratorRole = "editor";

export interface TripCollaboratorRecord {
  id: string;
  ownerUserId: string;
  collaboratorUserId: string;
  tripId: string;
  shareToken: string;
  role: TripCollaboratorRole;
  joinedAt: string;
}

export interface CollaborativeTrip extends TravelTrip {
  /** Present when this trip is owned by someone else and shared for editing. */
  collaboration?: {
    ownerUserId: string;
    role: TripCollaboratorRole;
    shareToken: string;
  };
}

function isCollaboratorRecord(value: unknown): value is TripCollaboratorRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TripCollaboratorRecord>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.ownerUserId === "string" &&
    typeof candidate.collaboratorUserId === "string" &&
    typeof candidate.tripId === "string" &&
    typeof candidate.shareToken === "string" &&
    candidate.role === "editor" &&
    typeof candidate.joinedAt === "string"
  );
}

function membershipKey(ownerUserId: string, tripId: string, collaboratorUserId: string): string {
  return `${ownerUserId}:${tripId}:${collaboratorUserId}`;
}

function userIndexKey(userId: string): string {
  return `${USER_INDEX_PREFIX}${userId}`;
}

async function readUserMembershipIds(userId: string): Promise<string[]> {
  const raw = await kvStoreGet<string[]>(userIndexKey(userId), { userId: COLLAB_NAMESPACE });
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

async function writeUserMembershipIds(userId: string, ids: string[]): Promise<void> {
  await kvStoreSet(userIndexKey(userId), [...new Set(ids)], { userId: COLLAB_NAMESPACE });
}

export async function listCollaborationsForUser(userId: string): Promise<TripCollaboratorRecord[]> {
  const ids = await readUserMembershipIds(userId);
  const records: TripCollaboratorRecord[] = [];
  for (const id of ids) {
    const record = await kvStoreGet<unknown>(id, { userId: COLLAB_NAMESPACE });
    if (isCollaboratorRecord(record) && record.collaboratorUserId === userId) {
      records.push(record);
    }
  }
  return records;
}

export async function getCollaborationForTrip(
  collaboratorUserId: string,
  tripId: string,
): Promise<TripCollaboratorRecord | null> {
  const records = await listCollaborationsForUser(collaboratorUserId);
  return records.find((record) => record.tripId === tripId) ?? null;
}

export async function resolveTripWriteAccess(
  requesterUserId: string,
  tripId: string,
): Promise<{ ownerUserId: string; canEdit: boolean; collaboration: TripCollaboratorRecord | null } | null> {
  // Owner path is handled by caller via getTrip(requester). Collaborator path:
  const collaboration = await getCollaborationForTrip(requesterUserId, tripId);
  if (!collaboration) {
    return null;
  }
  const share = await getShareRecord(collaboration.shareToken);
  if (!share || share.revokedAt || Date.parse(share.expiresAt) < Date.now()) {
    return null;
  }
  if (share.options.readOnly) {
    return { ownerUserId: collaboration.ownerUserId, canEdit: false, collaboration };
  }
  return { ownerUserId: collaboration.ownerUserId, canEdit: true, collaboration };
}

export async function listCollaborativeTripsForUser(userId: string): Promise<CollaborativeTrip[]> {
  const memberships = await listCollaborationsForUser(userId);
  const trips: CollaborativeTrip[] = [];
  for (const membership of memberships) {
    const share = await getShareRecord(membership.shareToken);
    if (!share || share.revokedAt || Date.parse(share.expiresAt) < Date.now()) {
      continue;
    }
    const trip = await getTrip(membership.tripId, membership.ownerUserId);
    if (!trip) continue;
    trips.push({
      ...trip,
      collaboration: {
        ownerUserId: membership.ownerUserId,
        role: membership.role,
        shareToken: membership.shareToken,
      },
    });
  }
  return trips;
}

/**
 * Accept an edit invite: both users must have Pro/lifetime/trial.
 * Creates a durable collaborator membership so the trip appears in My Trips.
 * Caller must enforce intended-email access before calling (see /api/trips/share/join).
 */
export async function joinTripAsCollaborator(args: {
  token: string;
  collaboratorUserId: string;
}): Promise<
  | { ok: true; record: TripCollaboratorRecord; trip: TravelTrip }
  | { ok: false; error: string; code: "unauthorized" | "forbidden" | "not-found" | "read-only" | "upgrade-required" }
> {
  const share = await getShareRecord(args.token);
  if (!share || share.revokedAt || Date.parse(share.expiresAt) < Date.now()) {
    return { ok: false, error: "Invite link is invalid or expired.", code: "not-found" };
  }
  if (share.options.readOnly) {
    return { ok: false, error: "This invite is view-only. Ask for an edit invite.", code: "read-only" };
  }
  if (share.ownerUserId === args.collaboratorUserId) {
    return { ok: false, error: "You already own this trip.", code: "forbidden" };
  }

  const [ownerPro, collaboratorPro] = await Promise.all([
    userHasProAccess(share.ownerUserId),
    userHasProAccess(args.collaboratorUserId),
  ]);
  if (!ownerPro || !collaboratorPro) {
    return {
      ok: false,
      error: "Both people need a paid Kepi plan (Pro or Lifetime) to edit a trip together.",
      code: "upgrade-required",
    };
  }

  const trip = await getTrip(share.tripId, share.ownerUserId);
  if (!trip) {
    return { ok: false, error: "Trip not found.", code: "not-found" };
  }

  const id = membershipKey(share.ownerUserId, share.tripId, args.collaboratorUserId);
  const existing = await kvStoreGet<unknown>(id, { userId: COLLAB_NAMESPACE });
  if (isCollaboratorRecord(existing)) {
    return { ok: true, record: existing, trip };
  }

  const record: TripCollaboratorRecord = {
    id,
    ownerUserId: share.ownerUserId,
    collaboratorUserId: args.collaboratorUserId,
    tripId: share.tripId,
    shareToken: share.token,
    role: "editor",
    joinedAt: new Date().toISOString(),
  };
  await kvStoreSet(id, record, { userId: COLLAB_NAMESPACE });
  const index = await readUserMembershipIds(args.collaboratorUserId);
  await writeUserMembershipIds(args.collaboratorUserId, [...index, id]);

  return { ok: true, record, trip };
}

export async function leaveTripCollaboration(args: {
  collaboratorUserId: string;
  tripId: string;
}): Promise<boolean> {
  const membership = await getCollaborationForTrip(args.collaboratorUserId, args.tripId);
  if (!membership) return false;
  await kvStoreDel(membership.id, { userId: COLLAB_NAMESPACE });
  const index = await readUserMembershipIds(args.collaboratorUserId);
  await writeUserMembershipIds(
    args.collaboratorUserId,
    index.filter((id) => id !== membership.id),
  );
  return true;
}

/** Debug / admin helper — list all collab records (bounded). */
export async function listAllCollaborations(limit = 200): Promise<TripCollaboratorRecord[]> {
  const rows = await kvStoreList<unknown>("", { userId: COLLAB_NAMESPACE, limit });
  return rows.map((row) => row.value).filter(isCollaboratorRecord);
}
