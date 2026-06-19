import { kvStoreGet } from "@/lib/travelAssistant/kvStore";
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
  ratio: string;
  multiplier: number;
}

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

const TRANSFER_BONUSES_KEY = "flights:transfer_bonuses";
const GLOBAL_USER = "global";

export async function getActiveTransferBonuses(): Promise<Record<string, number>> {
  try {
    const cached = await kvStoreGet<Record<string, number>>(TRANSFER_BONUSES_KEY, {
      userId: GLOBAL_USER,
    });
    if (cached && typeof cached === "object") {
      return cached;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function resolveReachability(
  targetProgram: LoyaltyProgram,
  milesNeeded: number,
  balances: Partial<Record<LoyaltyProgram, number>>,
  activeBonuses: Record<string, number> = {},
): ReachabilityPath[] {
  const paths: ReachabilityPath[] = [];

  const directBalance = balances[targetProgram] ?? 0;
  if (directBalance > 0 || balances[targetProgram] !== undefined) {
    paths.push({
      fromCurrency: targetProgram,
      toProgram: targetProgram,
      ratio: "1:1",
      hasEnoughBalance: directBalance >= milesNeeded,
      shortfall: directBalance >= milesNeeded ? undefined : milesNeeded - directBalance,
    });
  }

  for (const currency of BANK_CURRENCIES) {
    const held = balances[currency];
    if (!held || held <= 0) continue;

    const edges = TRANSFER_PARTNERS[currency];
    const edge = edges.find((e) => e.to === targetProgram);
    if (!edge) continue;

    const bonusKey = `${currency}->${targetProgram}`;
    const bonusPct = activeBonuses[bonusKey];
    const effectiveMultiplier = edge.multiplier * (1 + (bonusPct ? bonusPct / 100 : 0));
    const bankPointsRequired = Math.ceil(milesNeeded / effectiveMultiplier);

    paths.push({
      fromCurrency: currency,
      toProgram: targetProgram,
      ratio: edge.ratio,
      transferBonusPct: bonusPct,
      hasEnoughBalance: held >= bankPointsRequired,
      shortfall: held >= bankPointsRequired ? undefined : bankPointsRequired - held,
    });
  }

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
