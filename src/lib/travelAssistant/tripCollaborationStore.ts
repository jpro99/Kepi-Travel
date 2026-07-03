import { randomBytes } from "node:crypto";
import { kvStoreDel, kvStoreGet, kvStoreList, kvStoreSet, kvStoreSetNx } from "@/lib/travelAssistant/kvStore";
import { getTrip, type TravelTrip } from "@/lib/travelAssistant/tripStore";

const COLLAB_SYSTEM_NAMESPACE = "__trip-collab";
const INVITE_KEY_PREFIX = "invite";
const TRIP_COLLABORATORS_KEY_PREFIX = "trip-collaborators";
const SHARED_TRIPS_KEY = "shared-trips";
const SHARED_ACTIVE_TRIP_KEY = "shared-active-trip";
const TRIP_INVITE_PREFIX = "KEPI-TRIP-";
const INVITE_TTL_DAYS = 30;
const MAX_CODE_ATTEMPTS = 40;

export type TripCollaboratorRole = "viewer" | "editor";

export interface TripInviteRecord {
  code: string;
  tripId: string;
  ownerUserId: string;
  role: TripCollaboratorRole;
  intendedEmail: string | null;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  expiresAt: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  tripName: string;
  tripDestination: string;
}

export interface TripCollaboratorRecord {
  userId: string;
  role: TripCollaboratorRole;
  joinedAt: string;
  email: string | null;
  name: string | null;
}

export interface SharedTripRef {
  tripId: string;
  ownerUserId: string;
  role: TripCollaboratorRole;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  joinedAt: string;
}

export interface SharedActiveTripRef {
  tripId: string;
  ownerUserId: string;
}

export interface TripAccessGrant {
  ownerUserId: string;
  role: TripCollaboratorRole;
  isOwner: boolean;
}

export type RedeemTripInviteResult =
  | {
      ok: true;
      tripId: string;
      ownerUserId: string;
      role: TripCollaboratorRole;
      tripName: string;
      alreadyMember: boolean;
    }
  | {
      ok: false;
      reason:
        | "invalid-code"
        | "expired"
        | "revoked"
        | "email-mismatch"
        | "trip-missing";
    };

function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replaceAll(/[^A-Z0-9-]/g, "");
}

function inviteKey(code: string): string {
  return `${INVITE_KEY_PREFIX}/${normalizeInviteCode(code)}`;
}

function collaboratorsKey(tripId: string): string {
  return `${TRIP_COLLABORATORS_KEY_PREFIX}/${tripId}`;
}

function generateInviteCodeCandidate(): string {
  const suffix = randomBytes(4).toString("hex").toUpperCase().slice(0, 8);
  return `${TRIP_INVITE_PREFIX}${suffix}`;
}

function isInviteExpired(invite: TripInviteRecord): boolean {
  const expiresAtMs = Date.parse(invite.expiresAt);
  return Number.isNaN(expiresAtMs) || expiresAtMs < Date.now();
}

function sanitizeInviteRecord(value: unknown): TripInviteRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TripInviteRecord>;
  if (
    typeof candidate.code !== "string" ||
    typeof candidate.tripId !== "string" ||
    typeof candidate.ownerUserId !== "string" ||
    (candidate.role !== "viewer" && candidate.role !== "editor") ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    typeof candidate.tripName !== "string"
  ) {
    return null;
  }
  return {
    code: normalizeInviteCode(candidate.code),
    tripId: candidate.tripId,
    ownerUserId: candidate.ownerUserId,
    role: candidate.role,
    intendedEmail:
      typeof candidate.intendedEmail === "string" && candidate.intendedEmail.trim()
        ? candidate.intendedEmail.trim().toLowerCase()
        : null,
    status:
      candidate.status === "accepted"
        ? "accepted"
        : candidate.status === "revoked"
          ? "revoked"
          : "pending",
    createdAt: candidate.createdAt,
    expiresAt: candidate.expiresAt,
    acceptedBy: typeof candidate.acceptedBy === "string" ? candidate.acceptedBy : null,
    acceptedAt: typeof candidate.acceptedAt === "string" ? candidate.acceptedAt : null,
    tripName: candidate.tripName,
    tripDestination: typeof candidate.tripDestination === "string" ? candidate.tripDestination : "",
  };
}

function sanitizeCollaborator(value: unknown): TripCollaboratorRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TripCollaboratorRecord>;
  if (
    typeof candidate.userId !== "string" ||
    (candidate.role !== "viewer" && candidate.role !== "editor") ||
    typeof candidate.joinedAt !== "string"
  ) {
    return null;
  }
  return {
    userId: candidate.userId,
    role: candidate.role,
    joinedAt: candidate.joinedAt,
    email: typeof candidate.email === "string" ? candidate.email : null,
    name: typeof candidate.name === "string" ? candidate.name : null,
  };
}

function sanitizeSharedTripRef(value: unknown): SharedTripRef | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SharedTripRef>;
  if (
    typeof candidate.tripId !== "string" ||
    typeof candidate.ownerUserId !== "string" ||
    (candidate.role !== "viewer" && candidate.role !== "editor") ||
    typeof candidate.tripName !== "string" ||
    typeof candidate.destination !== "string" ||
    typeof candidate.startDate !== "string" ||
    typeof candidate.endDate !== "string" ||
    typeof candidate.joinedAt !== "string"
  ) {
    return null;
  }
  return {
    tripId: candidate.tripId,
    ownerUserId: candidate.ownerUserId,
    role: candidate.role,
    tripName: candidate.tripName,
    destination: candidate.destination,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    joinedAt: candidate.joinedAt,
  };
}

async function readCollaborators(ownerUserId: string, tripId: string): Promise<TripCollaboratorRecord[]> {
  try {
    const stored = await kvStoreGet<unknown>(collaboratorsKey(tripId), { userId: ownerUserId });
    if (!Array.isArray(stored)) return [];
    return stored
      .map((entry) => sanitizeCollaborator(entry))
      .filter((entry): entry is TripCollaboratorRecord => entry !== null);
  } catch {
    return [];
  }
}

async function writeCollaborators(
  ownerUserId: string,
  tripId: string,
  collaborators: TripCollaboratorRecord[],
): Promise<void> {
  await kvStoreSet(collaboratorsKey(tripId), collaborators, { userId: ownerUserId });
}

export async function listSharedTrips(userId: string): Promise<SharedTripRef[]> {
  try {
    const stored = await kvStoreGet<unknown>(SHARED_TRIPS_KEY, { userId });
    if (!Array.isArray(stored)) return [];
    return stored
      .map((entry) => sanitizeSharedTripRef(entry))
      .filter((entry): entry is SharedTripRef => entry !== null);
  } catch {
    return [];
  }
}

async function upsertSharedTripRef(userId: string, ref: SharedTripRef): Promise<void> {
  const existing = await listSharedTrips(userId);
  const next = existing.filter(
    (entry) => !(entry.tripId === ref.tripId && entry.ownerUserId === ref.ownerUserId),
  );
  next.push(ref);
  await kvStoreSet(SHARED_TRIPS_KEY, next, { userId });
}

async function removeSharedTripRef(userId: string, tripId: string, ownerUserId: string): Promise<void> {
  const existing = await listSharedTrips(userId);
  const next = existing.filter((entry) => !(entry.tripId === tripId && entry.ownerUserId === ownerUserId));
  await kvStoreSet(SHARED_TRIPS_KEY, next, { userId });
}

export async function getSharedActiveTripRef(userId: string): Promise<SharedActiveTripRef | null> {
  try {
    const stored = await kvStoreGet<unknown>(SHARED_ACTIVE_TRIP_KEY, { userId });
    if (!stored || typeof stored !== "object") return null;
    const candidate = stored as Partial<SharedActiveTripRef>;
    if (typeof candidate.tripId !== "string" || typeof candidate.ownerUserId !== "string") {
      return null;
    }
    return { tripId: candidate.tripId, ownerUserId: candidate.ownerUserId };
  } catch {
    return null;
  }
}

export async function setSharedActiveTripRef(
  userId: string,
  ref: SharedActiveTripRef,
): Promise<void> {
  await kvStoreSet(SHARED_ACTIVE_TRIP_KEY, ref, { userId });
}

export async function clearSharedActiveTripRef(userId: string): Promise<void> {
  try {
    await kvStoreDel(SHARED_ACTIVE_TRIP_KEY, { userId });
  } catch {
    // degrade silently
  }
}

export async function getTripInviteRecord(code: string): Promise<TripInviteRecord | null> {
  try {
    const stored = await kvStoreGet<unknown>(inviteKey(code), { userId: COLLAB_SYSTEM_NAMESPACE });
    return sanitizeInviteRecord(stored);
  } catch {
    return null;
  }
}

export async function createTripInvite(args: {
  ownerUserId: string;
  tripId: string;
  role: TripCollaboratorRole;
  intendedEmail?: string | null;
}): Promise<TripInviteRecord> {
  const trip = await getTrip(args.tripId, args.ownerUserId);
  if (!trip) {
    throw new Error("Trip not found.");
  }

  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = normalizeInviteCode(generateInviteCodeCandidate());
    const record: TripInviteRecord = {
      code,
      tripId: args.tripId,
      ownerUserId: args.ownerUserId,
      role: args.role,
      intendedEmail: args.intendedEmail?.trim().toLowerCase() || null,
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt,
      acceptedBy: null,
      acceptedAt: null,
      tripName: trip.name,
      tripDestination: trip.destination,
    };
    try {
      const created = await kvStoreSetNx(inviteKey(code), record, { userId: COLLAB_SYSTEM_NAMESPACE });
      if (created) {
        return record;
      }
    } catch {
      // try another code
    }
  }
  throw new Error("Unable to generate a unique trip invite code.");
}

export async function redeemTripInvite(args: {
  code: string;
  userId: string;
  email?: string | null;
  name?: string | null;
}): Promise<RedeemTripInviteResult> {
  const invite = await getTripInviteRecord(args.code);
  if (!invite) {
    return { ok: false, reason: "invalid-code" };
  }
  if (invite.status === "revoked") {
    return { ok: false, reason: "revoked" };
  }
  if (isInviteExpired(invite)) {
    return { ok: false, reason: "expired" };
  }
  if (invite.intendedEmail) {
    const normalizedEmail = args.email?.trim().toLowerCase() ?? "";
    if (!normalizedEmail || normalizedEmail !== invite.intendedEmail) {
      return { ok: false, reason: "email-mismatch" };
    }
  }

  const trip = await getTrip(invite.tripId, invite.ownerUserId);
  if (!trip) {
    return { ok: false, reason: "trip-missing" };
  }

  const collaborators = await readCollaborators(invite.ownerUserId, invite.tripId);
  const existing = collaborators.find((member) => member.userId === args.userId);
  if (!existing) {
    collaborators.push({
      userId: args.userId,
      role: invite.role,
      joinedAt: new Date().toISOString(),
      email: args.email?.trim().toLowerCase() ?? null,
      name: args.name?.trim() || null,
    });
    await writeCollaborators(invite.ownerUserId, invite.tripId, collaborators);
  }

  await upsertSharedTripRef(args.userId, {
    tripId: invite.tripId,
    ownerUserId: invite.ownerUserId,
    role: existing?.role ?? invite.role,
    tripName: trip.name,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    joinedAt: existing?.joinedAt ?? new Date().toISOString(),
  });

  if (invite.status === "pending") {
    const updatedInvite: TripInviteRecord = {
      ...invite,
      status: "accepted",
      acceptedBy: args.userId,
      acceptedAt: new Date().toISOString(),
    };
    await kvStoreSet(inviteKey(invite.code), updatedInvite, { userId: COLLAB_SYSTEM_NAMESPACE });
  }

  await setSharedActiveTripRef(args.userId, {
    tripId: invite.tripId,
    ownerUserId: invite.ownerUserId,
  });

  return {
    ok: true,
    tripId: invite.tripId,
    ownerUserId: invite.ownerUserId,
    role: existing?.role ?? invite.role,
    tripName: trip.name,
    alreadyMember: Boolean(existing),
  };
}

export async function listTripCollaborators(
  ownerUserId: string,
  tripId: string,
): Promise<TripCollaboratorRecord[]> {
  return readCollaborators(ownerUserId, tripId);
}

export async function revokeTripInvite(code: string, ownerUserId: string): Promise<boolean> {
  const invite = await getTripInviteRecord(code);
  if (!invite || invite.ownerUserId !== ownerUserId) {
    return false;
  }
  const updated: TripInviteRecord = { ...invite, status: "revoked" };
  await kvStoreSet(inviteKey(invite.code), updated, { userId: COLLAB_SYSTEM_NAMESPACE });
  return true;
}

export async function removeTripCollaborator(
  ownerUserId: string,
  tripId: string,
  memberUserId: string,
): Promise<boolean> {
  const collaborators = await readCollaborators(ownerUserId, tripId);
  const next = collaborators.filter((member) => member.userId !== memberUserId);
  if (next.length === collaborators.length) {
    return false;
  }
  await writeCollaborators(ownerUserId, tripId, next);
  await removeSharedTripRef(memberUserId, tripId, ownerUserId);
  const active = await getSharedActiveTripRef(memberUserId);
  if (active?.tripId === tripId && active.ownerUserId === ownerUserId) {
    await kvStoreDel(SHARED_ACTIVE_TRIP_KEY, { userId: memberUserId });
  }
  return true;
}

export async function getTripAccessGrant(
  userId: string,
  tripId: string,
  ownerUserIdHint?: string,
): Promise<TripAccessGrant | null> {
  const owned = await getTrip(tripId, userId);
  if (owned) {
    return { ownerUserId: userId, role: "editor", isOwner: true };
  }

  const sharedTrips = await listSharedTrips(userId);
  const match =
    sharedTrips.find(
      (entry) =>
        entry.tripId === tripId &&
        (ownerUserIdHint ? entry.ownerUserId === ownerUserIdHint : true),
    ) ?? null;
  if (!match) {
    return null;
  }
  return {
    ownerUserId: match.ownerUserId,
    role: match.role,
    isOwner: false,
  };
}

export async function assertTripEditAccess(
  userId: string,
  tripId: string,
  ownerUserIdHint?: string,
): Promise<TripAccessGrant> {
  const grant = await getTripAccessGrant(userId, tripId, ownerUserIdHint);
  if (!grant) {
    throw new Error("Trip not found.");
  }
  if (!grant.isOwner && grant.role !== "editor") {
    throw new Error("View-only access — you cannot edit this trip.");
  }
  return grant;
}

export async function resolveTripForUser(
  userId: string,
  tripId: string,
  ownerUserIdHint?: string,
): Promise<{ trip: TravelTrip; access: TripAccessGrant } | null> {
  const grant = await getTripAccessGrant(userId, tripId, ownerUserIdHint);
  if (!grant) {
    return null;
  }
  const trip = await getTrip(tripId, grant.ownerUserId);
  if (!trip) {
    return null;
  }
  return { trip, access: grant };
}

export async function listPendingTripInvitesForTrip(
  ownerUserId: string,
  tripId: string,
): Promise<TripInviteRecord[]> {
  try {
    const rows = await kvStoreList<unknown>(`${INVITE_KEY_PREFIX}/`, {
      userId: COLLAB_SYSTEM_NAMESPACE,
      limit: 500,
    });
    return rows
      .map((row) => sanitizeInviteRecord(row.value))
      .filter(
        (invite): invite is TripInviteRecord =>
          invite !== null &&
          invite.ownerUserId === ownerUserId &&
          invite.tripId === tripId &&
          invite.status === "pending" &&
          !isInviteExpired(invite),
      );
  } catch {
    return [];
  }
}
