import { randomBytes } from "node:crypto";
import { kvStoreGet, kvStoreSet, kvStoreSetNx, kvStoreList } from "@/lib/travelAssistant/kvStore";

const INVITE_SYSTEM_NAMESPACE = "__invite-system";
const CODE_KEY_PREFIX = "invite-code";
const USER_REDEMPTION_KEY_PREFIX = "user-invite-redemption";
const INVITE_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const INVITE_CODE_RANDOM_LENGTH = 6;
const MAX_GENERATION_ATTEMPTS = 40;
const INVITE_CODE_PREFIX = "KEPI-FRIEND-";
const REDEEMABLE_CODE_REGEX = /^[A-Z0-9-]{1,50}$/u;

export type InviteCodeType = "lifetime" | "trial-30";
export type InviteCodeStatus = "active" | "revoked" | "used";

export interface InviteCodeRecord {
  code: string;
  type: InviteCodeType;
  createdBy: string;
  createdAt: string;
  usedBy: string | null;
  usedAt: string | null;
  status: InviteCodeStatus;
  note: string | null;
}

export type RedeemInviteCodeResult =
  | { ok: true; record: InviteCodeRecord }
  | { ok: false; reason: "invalid-code" | "already-redeemed" | "code-revoked" | "code-used" };

function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replaceAll(/[^A-Z0-9-]/g, "");
}

function codeKey(code: string): string {
  return `${CODE_KEY_PREFIX}/${normalizeInviteCode(code)}`;
}

function userInviteRedemptionKey(userId: string): string {
  return `${USER_REDEMPTION_KEY_PREFIX}/${userId}`;
}

function randomSuffix(length: number): string {
  const bytes = randomBytes(length);
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += INVITE_CODE_ALPHABET[bytes[index] % INVITE_CODE_ALPHABET.length];
  }
  return output;
}

function sanitizeInviteCodeRecord(input: unknown): InviteCodeRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const candidate = input as Partial<InviteCodeRecord>;
  if (
    typeof candidate.code !== "string" ||
    (candidate.type !== "lifetime" && candidate.type !== "trial-30") ||
    typeof candidate.createdBy !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }
  return {
    code: normalizeInviteCode(candidate.code),
    type: candidate.type,
    createdBy: candidate.createdBy,
    createdAt: candidate.createdAt,
    usedBy: typeof candidate.usedBy === "string" ? candidate.usedBy : null,
    usedAt: typeof candidate.usedAt === "string" ? candidate.usedAt : null,
    status: candidate.status === "revoked" ? "revoked" : candidate.status === "used" ? "used" : "active",
    note: typeof candidate.note === "string" && candidate.note.trim().length > 0 ? candidate.note.trim() : null,
  };
}

export async function getInviteCodeRecord(code: string): Promise<InviteCodeRecord | null> {
  const stored = await kvStoreGet<unknown>(codeKey(code), { userId: INVITE_SYSTEM_NAMESPACE });
  return sanitizeInviteCodeRecord(stored);
}

export async function getInviteCodeRedeemedByUser(userId: string): Promise<string | null> {
  const stored = await kvStoreGet<string>(userInviteRedemptionKey(userId), { userId: INVITE_SYSTEM_NAMESPACE });
  if (!stored) {
    return null;
  }
  return normalizeInviteCode(stored);
}

export async function createInviteCode(args: {
  type: InviteCodeType;
  createdBy: string;
  note?: string | null;
}): Promise<InviteCodeRecord> {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const suffix = randomSuffix(INVITE_CODE_RANDOM_LENGTH);
    const candidate = normalizeInviteCode(`${INVITE_CODE_PREFIX}${suffix}`);
    const record: InviteCodeRecord = {
      code: candidate,
      type: args.type,
      createdBy: args.createdBy,
      createdAt: new Date().toISOString(),
      usedBy: null,
      usedAt: null,
      status: "active",
      note: args.note?.trim() ? args.note.trim() : null,
    };
    const created = await kvStoreSetNx(codeKey(candidate), record, { userId: INVITE_SYSTEM_NAMESPACE });
    if (created) {
      return record;
    }
  }
  throw new Error("Unable to generate a unique invite code.");
}

export async function redeemInviteCode(rawCode: string, userId: string): Promise<RedeemInviteCodeResult> {
  const code = normalizeInviteCode(rawCode);
  if (!REDEEMABLE_CODE_REGEX.test(code)) {
    return { ok: false, reason: "invalid-code" };
  }
  const existingUserRedemption = await getInviteCodeRedeemedByUser(userId);
  if (existingUserRedemption) {
    return { ok: false, reason: "already-redeemed" };
  }

  const existingRecord = await getInviteCodeRecord(code);
  if (!existingRecord) {
    return { ok: false, reason: "invalid-code" };
  }
  if (existingRecord.status === "revoked") {
    return { ok: false, reason: "code-revoked" };
  }
  if (existingRecord.status === "used" || existingRecord.usedBy) {
    return { ok: false, reason: "code-used" };
  }

  const updatedRecord: InviteCodeRecord = {
    ...existingRecord,
    usedBy: userId,
    usedAt: new Date().toISOString(),
    status: "used",
  };
  await Promise.all([
    kvStoreSet(codeKey(code), updatedRecord, { userId: INVITE_SYSTEM_NAMESPACE }),
    kvStoreSet(userInviteRedemptionKey(userId), code, { userId: INVITE_SYSTEM_NAMESPACE }),
  ]);
  return { ok: true, record: updatedRecord };
}

export async function revokeInviteCode(code: string): Promise<InviteCodeRecord | null> {
  const existing = await getInviteCodeRecord(code);
  if (!existing) {
    return null;
  }
  const nextRecord: InviteCodeRecord = {
    ...existing,
    status: "revoked",
  };
  await kvStoreSet(codeKey(existing.code), nextRecord, { userId: INVITE_SYSTEM_NAMESPACE });
  return nextRecord;
}

export async function listInviteCodes(limit = 2000): Promise<InviteCodeRecord[]> {
  const entries = await kvStoreList<unknown>(`${CODE_KEY_PREFIX}/`, {
    userId: INVITE_SYSTEM_NAMESPACE,
    limit,
  });
  return entries
    .map((entry) => sanitizeInviteCodeRecord(entry.value))
    .filter((entry): entry is InviteCodeRecord => entry !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
