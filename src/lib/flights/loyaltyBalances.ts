import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { getTravelerGenome } from "@/lib/traveler/travelerGenomeStore";
import type { LoyaltyProgram } from "./types";

export type LoyaltyBalances = Partial<Record<LoyaltyProgram, number>>;

const LOYALTY_BALANCES_KEY = "flights:loyalty_balances";

const GENOME_TO_LOYALTY: Record<string, LoyaltyProgram> = {
  "chase ultimate rewards": "chase_ur",
  "amex membership rewards": "amex_mr",
  "capital one": "capitalone",
  "citi thankyou": "citi_typ",
  "bilt rewards": "bilt",
  united: "united",
  "united mileageplus": "united",
  american: "american",
  "american aadvantage": "american",
  delta: "delta",
  "delta skymiles": "delta",
  alaska: "alaska",
  "alaska mileage plan": "alaska",
  aeroplan: "aeroplan",
  "flying blue": "flyingblue",
  flyingblue: "flyingblue",
  "british airways": "avios_ba",
  "ba avios": "avios_ba",
  jetblue: "jetblue",
  southwest: "southwest",
};

function mapProgramLabel(label: string): LoyaltyProgram | null {
  const key = label.trim().toLowerCase();
  return GENOME_TO_LOYALTY[key] ?? (key.replace(/\s+/g, "_") as LoyaltyProgram);
}

function balancesFromGenome(userId: string): Promise<LoyaltyBalances> {
  return getTravelerGenome(userId).then((genome) => {
    const balances: LoyaltyBalances = {};
    for (const row of genome.pointsBalances) {
      const program = mapProgramLabel(row.program);
      if (program && row.balance > 0) {
        balances[program] = (balances[program] ?? 0) + row.balance;
      }
    }
    return balances;
  });
}

export async function getLoyaltyBalances(userId: string): Promise<LoyaltyBalances> {
  if (!userId) return {};
  try {
    const stored = await kvStoreGet<LoyaltyBalances>(LOYALTY_BALANCES_KEY, { userId });
    if (stored && typeof stored === "object" && Object.keys(stored).length > 0) {
      return stored;
    }
  } catch {
    /* fall through */
  }
  return balancesFromGenome(userId);
}

export async function setLoyaltyBalances(userId: string, balances: LoyaltyBalances): Promise<boolean> {
  if (!userId) return false;
  try {
    await kvStoreSet(LOYALTY_BALANCES_KEY, sanitize(balances), { userId });
    return true;
  } catch {
    return false;
  }
}

function sanitize(balances: LoyaltyBalances): LoyaltyBalances {
  const clean: LoyaltyBalances = {};
  for (const [program, value] of Object.entries(balances)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      clean[program as LoyaltyProgram] = Math.round(value);
    }
  }
  return clean;
}
