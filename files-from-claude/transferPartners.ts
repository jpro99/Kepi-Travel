// src/lib/flights/transferPartners.ts
// Maps transferable bank currencies -> airline programs, and resolves whether a
// user can actually REACH a given award with what they hold. This is the layer
// that turns "here's an award" into "you can book this, transfer 60k Chase to
// United." PointsYeah does a version of this; fusing it with live booking is the
// differentiator.
//
// Keep TRANSFER_PARTNERS current — partners and ratios change. Bonuses are
// time-sensitive and ideally pulled from a small Redis-backed table you update
// (getActiveTransferBonuses) rather than hardcoded.

import type { LoyaltyProgram, ReachabilityPath } from "./types";

type BankCurrency =
  | "chase_ur"
  | "amex_mr"
  | "capitalone"
  | "citi_typ"
  | "bilt"
  | "wellsfargo";

interface PartnerEdge {
  to: LoyaltyProgram;
  ratio: string; // display ratio, almost always "1:1"
  multiplier: number; // points out per point in (1.0 for 1:1)
}

// Non-exhaustive but covers the high-value paths. Add as needed.
const TRANSFER_PARTNERS: Record<BankCurrency, PartnerEdge[]> = {
  chase_ur: [
    { to: "united", ratio: "1:1", multiplier: 1 },
    { to: "southwest", ratio: "1:1", multiplier: 1 },
    { to: "jetblue", ratio: "1:1", multiplier: 1 },
    { to: "aeroplan", ratio: "1:1", multiplier: 1 },
    { to: "flyingblue", ratio: "1:1", multiplier: 1 },
    { to: "avios_ba", ratio: "1:1", multiplier: 1 },
    { to: "avios_iberia", ratio: "1:1", multiplier: 1 },
    { to: "virginatlantic", ratio: "1:1", multiplier: 1 },
    { to: "emirates", ratio: "1:1", multiplier: 1 },
    { to: "singapore_krisflyer", ratio: "1:1", multiplier: 1 },
  ],
  amex_mr: [
    { to: "delta", ratio: "1:1", multiplier: 1 },
    { to: "ana", ratio: "1:1", multiplier: 1 },
    { to: "flyingblue", ratio: "1:1", multiplier: 1 },
    { to: "avios_ba", ratio: "1:1", multiplier: 1 },
    { to: "virginatlantic", ratio: "1:1", multiplier: 1 },
    { to: "singapore_krisflyer", ratio: "1:1", multiplier: 1 },
    { to: "lifemiles", ratio: "1:1", multiplier: 1 },
    { to: "emirates", ratio: "1:1", multiplier: 1 },
    { to: "etihad", ratio: "1:1", multiplier: 1 },
    { to: "qatar_avios", ratio: "1:1", multiplier: 1 },
    { to: "aeroplan", ratio: "1:1", multiplier: 1 },
    { to: "jetblue", ratio: "1:1", multiplier: 1 },
  ],
  capitalone: [
    { to: "flyingblue", ratio: "1:1", multiplier: 1 },
    { to: "avios_ba", ratio: "1:1", multiplier: 1 },
    { to: "aeroplan", ratio: "1:1", multiplier: 1 },
    { to: "lifemiles", ratio: "1:1", multiplier: 1 },
    { to: "emirates", ratio: "1:1", multiplier: 1 },
    { to: "singapore_krisflyer", ratio: "1:1", multiplier: 1 },
    { to: "turkish", ratio: "1:1", multiplier: 1 },
    { to: "virginatlantic", ratio: "1:1", multiplier: 1 },
  ],
  citi_typ: [
    { to: "flyingblue", ratio: "1:1", multiplier: 1 },
    { to: "lifemiles", ratio: "1:1", multiplier: 1 },
    { to: "emirates", ratio: "1:1", multiplier: 1 },
    { to: "etihad", ratio: "1:1", multiplier: 1 },
    { to: "jetblue", ratio: "1:1", multiplier: 1 },
    { to: "qatar_avios", ratio: "1:1", multiplier: 1 },
    { to: "singapore_krisflyer", ratio: "1:1", multiplier: 1 },
    { to: "turkish", ratio: "1:1", multiplier: 1 },
    { to: "virginatlantic", ratio: "1:1", multiplier: 1 },
  ],
  bilt: [
    { to: "united", ratio: "1:1", multiplier: 1 },
    { to: "flyingblue", ratio: "1:1", multiplier: 1 },
    { to: "avios_ba", ratio: "1:1", multiplier: 1 },
    { to: "aeroplan", ratio: "1:1", multiplier: 1 },
    { to: "virginatlantic", ratio: "1:1", multiplier: 1 },
    { to: "turkish", ratio: "1:1", multiplier: 1 },
  ],
  wellsfargo: [
    { to: "flyingblue", ratio: "1:1", multiplier: 1 },
    { to: "avios_ba", ratio: "1:1", multiplier: 1 },
    { to: "aeroplan", ratio: "1:1", multiplier: 1 },
    { to: "virginatlantic", ratio: "1:1", multiplier: 1 },
  ],
};

const BANK_CURRENCIES: BankCurrency[] = [
  "chase_ur",
  "amex_mr",
  "capitalone",
  "citi_typ",
  "bilt",
  "wellsfargo",
];

function isBankCurrency(p: LoyaltyProgram): p is BankCurrency {
  return (BANK_CURRENCIES as string[]).includes(p);
}

// Active transfer bonuses, keyed "fromCurrency->toProgram" => bonus %.
// Hardcoded fallback is empty; override via Redis table you keep updated.
export async function getActiveTransferBonuses(): Promise<Record<string, number>> {
  try {
    const { kvStoreGet } = await import("@/lib/redis");
    const cached = await kvStoreGet("flights:transfer_bonuses");
    if (cached && typeof cached === "object") {
      return cached as Record<string, number>;
    }
  } catch {
    // ignore
  }
  return {};
}

// Given the user's balances and the program an award tickets in, return every
// way they can reach it (direct holding OR transfer), flagged with whether they
// have enough and any active bonus.
export function resolveReachability(
  targetProgram: LoyaltyProgram,
  milesNeeded: number,
  balances: Partial<Record<LoyaltyProgram, number>>,
  activeBonuses: Record<string, number> = {}
): ReachabilityPath[] {
  const paths: ReachabilityPath[] = [];

  // 1) Direct holding in the ticketing program.
  const directBalance = balances[targetProgram] ?? 0;
  if (directBalance > 0 || balances[targetProgram] !== undefined) {
    paths.push({
      fromCurrency: targetProgram,
      toProgram: targetProgram,
      ratio: "1:1",
      hasEnoughBalance: directBalance >= milesNeeded,
      shortfall:
        directBalance >= milesNeeded ? undefined : milesNeeded - directBalance,
    });
  }

  // 2) Transfers from each bank currency the user holds.
  for (const currency of BANK_CURRENCIES) {
    const held = balances[currency];
    if (!held || held <= 0) continue;

    const edges = TRANSFER_PARTNERS[currency];
    const edge = edges.find((e) => e.to === targetProgram);
    if (!edge) continue;

    const bonusKey = `${currency}->${targetProgram}`;
    const bonusPct = activeBonuses[bonusKey];
    const effectiveMultiplier =
      edge.multiplier * (1 + (bonusPct ? bonusPct / 100 : 0));
    // miles you must transfer FROM the bank to land milesNeeded in the program
    const bankPointsRequired = Math.ceil(milesNeeded / effectiveMultiplier);

    paths.push({
      fromCurrency: currency,
      toProgram: targetProgram,
      ratio: edge.ratio,
      transferBonusPct: bonusPct,
      hasEnoughBalance: held >= bankPointsRequired,
      shortfall:
        held >= bankPointsRequired ? undefined : bankPointsRequired - held,
    });
  }

  // Sort: reachable-with-bonus first, then reachable, then closest shortfall.
  return paths.sort((first, second) => {
    if (first.hasEnoughBalance !== second.hasEnoughBalance) {
      return first.hasEnoughBalance ? -1 : 1;
    }
    const bonusA = first.transferBonusPct ?? 0;
    const bonusB = second.transferBonusPct ?? 0;
    if (bonusA !== bonusB) return bonusB - bonusA;
    return (first.shortfall ?? 0) - (second.shortfall ?? 0);
  });
}

export { isBankCurrency };
