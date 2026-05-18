import { randomBytes } from "node:crypto";
import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";

const REFERRAL_NAMESPACE_USER_ID = "referral";
const USER_CODE_KEY_PREFIX = "user-code";
const USER_REDEMPTION_KEY_PREFIX = "user-redemption";
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_REFERRER_REWARD_DAYS = 30;
const REFERRAL_REFEREE_REWARD_DAYS = 14;
const MAX_GENERATION_ATTEMPTS = 30;
const REFERRAL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export interface ReferralUseEntry {
  newUserId: string;
  redeemedAt: string;
  status: "converted";
  referrerAwardedDays: number;
  refereeAwardedDays: number;
}

export interface ReferralCodeRecord {
  userId: string;
  createdAt: string;
  uses: ReferralUseEntry[];
}

export interface ReferralStats {
  code: string | null;
  totalUses: number;
  successfulConversions: number;
  totalDaysEarned: number;
}

export type RedeemReferralResult =
  | {
      ok: true;
      code: string;
      referrerUserId: string;
      newUserId: string;
      referrerAwardedDays: number;
      refereeAwardedDays: number;
      redeemedAt: string;
    }
  | { ok: false; reason: "invalid-code" | "self-referral" | "already-redeemed" };

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function randomCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let output = "";
  for (let index = 0; index < REFERRAL_CODE_LENGTH; index += 1) {
    output += REFERRAL_ALPHABET[bytes[index] % REFERRAL_ALPHABET.length];
  }
  return output;
}

function userCodeKey(userId: string): string {
  return `${USER_CODE_KEY_PREFIX}/${userId}`;
}

function userRedemptionKey(userId: string): string {
  return `${USER_REDEMPTION_KEY_PREFIX}/${userId}`;
}

function sanitizeUseEntry(input: unknown): ReferralUseEntry | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<ReferralUseEntry>;
  if (
    typeof candidate.newUserId !== "string" ||
    typeof candidate.redeemedAt !== "string" ||
    candidate.status !== "converted" ||
    typeof candidate.referrerAwardedDays !== "number" ||
    typeof candidate.refereeAwardedDays !== "number"
  ) {
    return null;
  }
  return {
    newUserId: candidate.newUserId,
    redeemedAt: candidate.redeemedAt,
    status: "converted",
    referrerAwardedDays: Math.max(0, Math.round(candidate.referrerAwardedDays)),
    refereeAwardedDays: Math.max(0, Math.round(candidate.refereeAwardedDays)),
  };
}

function sanitizeCodeRecord(input: unknown): ReferralCodeRecord | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<ReferralCodeRecord>;
  if (typeof candidate.userId !== "string" || typeof candidate.createdAt !== "string") {
    return null;
  }
  const uses = Array.isArray(candidate.uses)
    ? candidate.uses.map((entry) => sanitizeUseEntry(entry)).filter((entry): entry is ReferralUseEntry => entry !== null)
    : [];
  return {
    userId: candidate.userId,
    createdAt: candidate.createdAt,
    uses,
  };
}

async function getReferralRecordByCode(code: string): Promise<ReferralCodeRecord | null> {
  const stored = await kvStoreGet<unknown>(normalizeCode(code), { userId: REFERRAL_NAMESPACE_USER_ID });
  return sanitizeCodeRecord(stored);
}

async function setReferralRecordByCode(code: string, record: ReferralCodeRecord): Promise<void> {
  await kvStoreSet(normalizeCode(code), record, { userId: REFERRAL_NAMESPACE_USER_ID });
}

export async function getReferralCode(userId: string): Promise<string | null> {
  const stored = await kvStoreGet<string>(userCodeKey(userId), { userId: REFERRAL_NAMESPACE_USER_ID });
  if (!stored) return null;
  const normalized = normalizeCode(stored);
  const record = await getReferralRecordByCode(normalized);
  if (!record || record.userId !== userId) {
    return null;
  }
  return normalized;
}

export async function createReferralCode(userId: string): Promise<string> {
  const existing = await getReferralCode(userId);
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = randomCode();
    const collision = await getReferralRecordByCode(candidate);
    if (collision) {
      continue;
    }
    const record: ReferralCodeRecord = {
      userId,
      createdAt: new Date().toISOString(),
      uses: [],
    };
    await Promise.all([
      setReferralRecordByCode(candidate, record),
      kvStoreSet(userCodeKey(userId), candidate, { userId: REFERRAL_NAMESPACE_USER_ID }),
    ]);
    return candidate;
  }

  throw new Error("Unable to generate a unique referral code.");
}

export async function redeemReferralCode(code: string, newUserId: string): Promise<RedeemReferralResult> {
  const normalizedCode = normalizeCode(code);
  if (!/^[A-Z0-9]{8}$/u.test(normalizedCode)) {
    return { ok: false, reason: "invalid-code" };
  }

  const record = await getReferralRecordByCode(normalizedCode);
  if (!record) {
    return { ok: false, reason: "invalid-code" };
  }
  if (record.userId === newUserId) {
    return { ok: false, reason: "self-referral" };
  }

  const existingRedemption = await kvStoreGet<string>(userRedemptionKey(newUserId), {
    userId: REFERRAL_NAMESPACE_USER_ID,
  });
  if (existingRedemption) {
    return { ok: false, reason: "already-redeemed" };
  }
  if (record.uses.some((entry) => entry.newUserId === newUserId)) {
    return { ok: false, reason: "already-redeemed" };
  }

  const redeemedAt = new Date().toISOString();
  const useEntry: ReferralUseEntry = {
    newUserId,
    redeemedAt,
    status: "converted",
    referrerAwardedDays: REFERRAL_REFERRER_REWARD_DAYS,
    refereeAwardedDays: REFERRAL_REFEREE_REWARD_DAYS,
  };
  const nextRecord: ReferralCodeRecord = {
    ...record,
    uses: [useEntry, ...record.uses],
  };
  await Promise.all([
    setReferralRecordByCode(normalizedCode, nextRecord),
    kvStoreSet(userRedemptionKey(newUserId), normalizedCode, { userId: REFERRAL_NAMESPACE_USER_ID }),
  ]);

  return {
    ok: true,
    code: normalizedCode,
    referrerUserId: record.userId,
    newUserId,
    referrerAwardedDays: REFERRAL_REFERRER_REWARD_DAYS,
    refereeAwardedDays: REFERRAL_REFEREE_REWARD_DAYS,
    redeemedAt,
  };
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const code = await getReferralCode(userId);
  if (!code) {
    return {
      code: null,
      totalUses: 0,
      successfulConversions: 0,
      totalDaysEarned: 0,
    };
  }
  const record = await getReferralRecordByCode(code);
  const uses = record?.uses ?? [];
  const successfulConversions = uses.filter((entry) => entry.status === "converted").length;
  const totalDaysEarned = uses.reduce((total, entry) => total + entry.referrerAwardedDays, 0);
  return {
    code,
    totalUses: uses.length,
    successfulConversions,
    totalDaysEarned,
  };
}
