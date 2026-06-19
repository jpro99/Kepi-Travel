import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import type { PointsBalance } from "@/lib/traveler/types";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";

const LOYALTY_BALANCES_KEY = "flights:loyalty_balances";

export interface StoredLoyaltyBalance {
  program: string;
  balance: number;
  baselineCpp?: number;
  updatedAt?: string;
}

/** Per-user balances — genome first, Redis override optional. */
export async function getLoyaltyBalances(userId: string): Promise<StoredLoyaltyBalance[]> {
  const override = await kvStoreGet<StoredLoyaltyBalance[]>(LOYALTY_BALANCES_KEY, { userId });
  if (override?.length) return override;

  const genome = await getTravelerGenome(userId);
  return genome.pointsBalances.map((row: PointsBalance) => ({
    program: row.program,
    balance: row.balance,
    baselineCpp: row.baselineCpp,
  }));
}

export async function saveLoyaltyBalances(userId: string, balances: StoredLoyaltyBalance[]): Promise<void> {
  const stamped = balances.map((row) => ({ ...row, updatedAt: new Date().toISOString() }));
  await kvStoreSet(LOYALTY_BALANCES_KEY, stamped, { userId });
}
