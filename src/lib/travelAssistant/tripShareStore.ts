import { randomBytes } from "node:crypto";
import type { SessionReservation } from "@/lib/travelAssistant/clientSessionState";
import { kvStoreGet, kvStoreList, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { getTrip } from "@/lib/travelAssistant/tripStore";

const SHARE_NAMESPACE_USER = "share";

export interface TripShareOptions {
  expiresInDays: number;
  readOnly: boolean;
  showPersonalNotes: boolean;
}

interface TripShareRecord {
  token: string;
  ownerUserId: string;
  tripId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  options: TripShareOptions;
}

interface SharedTripPayload {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  stage: string;
  createdAt: string;
  reservations: Array<
    Omit<SessionReservation, "notes"> & {
      notes?: string;
    }
  >;
}

export type SharedTripLookupResult =
  | {
      status: "ok";
      token: string;
      trip: SharedTripPayload;
      options: TripShareOptions;
      expiresAt: string;
    }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "revoked" }
  | { status: "missing-trip" };

function normalizeOptions(options: TripShareOptions): TripShareOptions {
  return {
    expiresInDays: Math.min(30, Math.max(1, Math.round(options.expiresInDays))),
    readOnly: Boolean(options.readOnly),
    showPersonalNotes: Boolean(options.showPersonalNotes),
  };
}

function generateShareToken(): string {
  return randomBytes(9).toString("base64url").replaceAll(/[^A-Za-z0-9_-]/g, "").slice(0, 12);
}

function isShareRecord(value: unknown): value is TripShareRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TripShareRecord>;
  return (
    typeof candidate.token === "string" &&
    typeof candidate.ownerUserId === "string" &&
    typeof candidate.tripId === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.expiresAt === "string" &&
    (typeof candidate.revokedAt === "string" || candidate.revokedAt === null) &&
    !!candidate.options &&
    typeof candidate.options.expiresInDays === "number" &&
    typeof candidate.options.readOnly === "boolean" &&
    typeof candidate.options.showPersonalNotes === "boolean"
  );
}

function isExpired(share: TripShareRecord): boolean {
  const expiresAtMs = Date.parse(share.expiresAt);
  return Number.isNaN(expiresAtMs) || expiresAtMs < Date.now();
}

async function listShareRecords(): Promise<TripShareRecord[]> {
  const rows = await kvStoreList<unknown>("", {
    userId: SHARE_NAMESPACE_USER,
    limit: 500,
  });
  return rows
    .map((row) => row.value)
    .filter((row): row is TripShareRecord => isShareRecord(row));
}

async function findActiveShareRecord(args: {
  ownerUserId: string;
  tripId: string;
}): Promise<TripShareRecord | null> {
  const all = await listShareRecords();
  const record = all.find((share) => {
    return (
      share.ownerUserId === args.ownerUserId &&
      share.tripId === args.tripId &&
      share.revokedAt === null &&
      !isExpired(share)
    );
  });
  return record ?? null;
}

function sanitizeSharedTrip(
  source: {
    id: string;
    name: string;
    destination: string;
    startDate: string;
    endDate: string;
    stage: string;
    createdAt: string;
    reservations: SessionReservation[];
  },
  options: TripShareOptions,
): SharedTripPayload {
  return {
    id: source.id,
    name: source.name,
    destination: source.destination,
    startDate: source.startDate,
    endDate: source.endDate,
    stage: source.stage,
    createdAt: source.createdAt,
    reservations: source.reservations.map((reservation) => {
      const sanitized: SharedTripPayload["reservations"][number] = {
        id: reservation.id,
        type: reservation.type,
        title: reservation.title,
        provider: reservation.provider,
        localTime: reservation.localTime,
        timezone: reservation.timezone,
        location: reservation.location,
        confirmationCode: reservation.confirmationCode,
        assignedTo: reservation.assignedTo,
        stage: reservation.stage,
        critical: reservation.critical,
        confidence: reservation.confidence,
        source: reservation.source,
      };
      if (options.showPersonalNotes) {
        sanitized.notes = reservation.notes;
      }
      return sanitized;
    }),
  };
}

export async function createShareLink(
  userId: string,
  tripId: string,
  options: TripShareOptions,
): Promise<{
  token: string;
  expiresAt: string;
  options: TripShareOptions;
  existing: boolean;
}> {
  const trip = await getTrip(tripId, userId);
  if (!trip) {
    throw new Error("Trip not found.");
  }

  const normalizedOptions = normalizeOptions(options);
  const existing = await findActiveShareRecord({
    ownerUserId: userId,
    tripId,
  });

  if (existing) {
    const updated: TripShareRecord = {
      ...existing,
      options: normalizedOptions,
      expiresAt: new Date(
        Date.now() + normalizedOptions.expiresInDays * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
    await kvStoreSet(existing.token, updated, { userId: SHARE_NAMESPACE_USER });
    return {
      token: existing.token,
      expiresAt: updated.expiresAt,
      options: updated.options,
      existing: true,
    };
  }

  let token = generateShareToken();
  for (let attempts = 0; attempts < 5; attempts += 1) {
    const collision = await kvStoreGet<TripShareRecord>(token, {
      userId: SHARE_NAMESPACE_USER,
    });
    if (!collision) break;
    token = generateShareToken();
  }

  const shareRecord: TripShareRecord = {
    token,
    ownerUserId: userId,
    tripId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(
      Date.now() + normalizedOptions.expiresInDays * 24 * 60 * 60 * 1000,
    ).toISOString(),
    revokedAt: null,
    options: normalizedOptions,
  };
  await kvStoreSet(token, shareRecord, { userId: SHARE_NAMESPACE_USER });
  return {
    token,
    expiresAt: shareRecord.expiresAt,
    options: shareRecord.options,
    existing: false,
  };
}

export async function getShareRecord(token: string): Promise<TripShareRecord | null> {
  const normalizedToken = token.trim();
  if (!/^[A-Za-z0-9_-]{12}$/u.test(normalizedToken)) {
    return null;
  }
  const shareRecord = await kvStoreGet<TripShareRecord>(normalizedToken, {
    userId: SHARE_NAMESPACE_USER,
  });
  if (!shareRecord || !isShareRecord(shareRecord)) {
    return null;
  }
  return shareRecord;
}

export async function getSharedTrip(token: string): Promise<SharedTripLookupResult> {
  const shareRecord = await getShareRecord(token);
  if (!shareRecord) {
    return { status: "invalid" };
  }
  if (shareRecord.revokedAt) {
    return { status: "revoked" };
  }
  if (isExpired(shareRecord)) {
    return { status: "expired" };
  }

  const trip = await getTrip(shareRecord.tripId, shareRecord.ownerUserId);
  if (!trip) {
    return { status: "missing-trip" };
  }

  return {
    status: "ok",
    token: shareRecord.token,
    trip: sanitizeSharedTrip(trip, shareRecord.options),
    options: shareRecord.options,
    expiresAt: shareRecord.expiresAt,
  };
}

export async function revokeShareLink(token: string, requesterUserId?: string): Promise<boolean> {
  const normalizedToken = token.trim();
  const shareRecord = await kvStoreGet<TripShareRecord>(normalizedToken, {
    userId: SHARE_NAMESPACE_USER,
  });
  if (!shareRecord || !isShareRecord(shareRecord)) {
    return false;
  }
  if (requesterUserId && shareRecord.ownerUserId !== requesterUserId) {
    return false;
  }
  const revoked: TripShareRecord = {
    ...shareRecord,
    revokedAt: new Date().toISOString(),
  };
  await kvStoreSet(normalizedToken, revoked, { userId: SHARE_NAMESPACE_USER });
  return true;
}
