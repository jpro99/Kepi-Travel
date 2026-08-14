import "server-only";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { decideFamilyLocationWrite } from "@/lib/family/decideFamilyLocationWrite";

export const FAMILY_LOCATION_KEY = (memberId: string) => `family:location:${memberId}`;
export const FAMILY_MEMBERSHIP_KEY = "family:membership";

export type StoredFamilyLocation = {
  lat: number;
  lon: number;
  accuracy?: number;
  updatedAt: string;
  memberId: string;
  label?: string;
};

export function resolveFamilyMembership(
  raw: unknown,
  selfUserId: string,
): { ownerId: string; groupId: string; inviteCode: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  let ownerId = r.ownerId;
  let groupId = (r.groupId as string) ?? "";
  const inviteCode = (r.inviteCode as string) ?? "";
  if (ownerId && typeof ownerId === "object" && "ownerId" in (ownerId as object)) {
    const nested = ownerId as Record<string, unknown>;
    ownerId = nested.ownerId;
    if (nested.groupId && typeof nested.groupId === "string") {
      groupId = nested.groupId;
    }
  }
  if (typeof ownerId !== "string" || !ownerId || ownerId === selfUserId) return null;
  return { ownerId, groupId, inviteCode };
}

export async function persistFamilyMemberLocation(input: {
  memberId: string;
  ownerNamespace: string;
  lat: number;
  lon: number;
  accuracy?: number;
  label?: string;
}): Promise<{
  ok: true;
  location?: StoredFamilyLocation;
  skipped?: boolean;
  reason?: string;
  upgraded?: boolean;
}> {
  const prev = await kvStoreGet<StoredFamilyLocation>(FAMILY_LOCATION_KEY(input.memberId), {
    userId: input.ownerNamespace,
  });
  const decision = decideFamilyLocationWrite(prev, {
    lat: input.lat,
    lon: input.lon,
    accuracy: input.accuracy,
  });
  if (decision.action === "skip") {
    return { ok: true, skipped: true, reason: decision.reason, location: prev ?? undefined };
  }
  const loc: StoredFamilyLocation = {
    lat: input.lat,
    lon: input.lon,
    accuracy: input.accuracy,
    updatedAt: new Date().toISOString(),
    memberId: input.memberId,
    label: input.label,
  };
  await kvStoreSet(FAMILY_LOCATION_KEY(input.memberId), loc, { userId: input.ownerNamespace });
  return { ok: true, location: loc, upgraded: decision.reason === "upgrade" };
}
