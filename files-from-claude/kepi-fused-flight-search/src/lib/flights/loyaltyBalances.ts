// src/lib/flights/loyaltyBalances.ts
// Stores each user's loyalty/points balances so the search can personalize:
// "you can book this with the 80k Chase UR you're holding."
//
// Uses your existing lazy Redis helper (src/lib/redis.ts). Per your standing
// rule, kvStoreSet auto-serializes — we pass plain objects, never pre-stringify.

import type { LoyaltyProgram } from "./types";

export type LoyaltyBalances = Partial<Record<LoyaltyProgram, number>>;

function balancesKey(userId: string): string {
  return `user:${userId}:loyalty_balances`;
}

export async function getLoyaltyBalances(
  userId: string
): Promise<LoyaltyBalances> {
  if (!userId) return {};
  try {
    const { kvStoreGet } = await import("@/lib/redis");
    const stored = await kvStoreGet(balancesKey(userId));
    if (stored && typeof stored === "object") {
      return stored as LoyaltyBalances;
    }
  } catch {
    // ignore — treat as no balances on read failure
  }
  return {};
}

export async function setLoyaltyBalances(
  userId: string,
  balances: LoyaltyBalances
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { kvStoreSet } = await import("@/lib/redis");
    // Pass the object directly — kvStoreSet handles serialization.
    await kvStoreSet(balancesKey(userId), sanitize(balances));
    return true;
  } catch {
    return false;
  }
}

export async function updateLoyaltyBalance(
  userId: string,
  program: LoyaltyProgram,
  amount: number
): Promise<LoyaltyBalances> {
  const current = await getLoyaltyBalances(userId);
  const next: LoyaltyBalances = { ...current, [program]: Math.max(0, Math.round(amount)) };
  await setLoyaltyBalances(userId, next);
  return next;
}

// Drop non-positive / non-finite entries so the map stays clean.
function sanitize(balances: LoyaltyBalances): LoyaltyBalances {
  const clean: LoyaltyBalances = {};
  for (const [program, value] of Object.entries(balances)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      clean[program as LoyaltyProgram] = Math.round(value);
    }
  }
  return clean;
}
