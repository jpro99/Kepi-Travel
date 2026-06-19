import { kvStoreGet } from "@/lib/travelAssistant/kvStore";

const TRANSFER_BONUSES_KEY = "flights:transfer_bonuses";

/** Bank program label → Seats.aero mileage program slugs */
export const TRANSFER_PARTNERS: Record<string, string[]> = {
  "chase ultimate rewards": [
    "united",
    "hyatt",
    "aeroplan",
    "virginatlantic",
    "flyingblue",
    "britishairways",
    "iberia",
    "singapore",
    "jetblue",
  ],
  "amex membership rewards": [
    "delta",
    "aeroplan",
    "flyingblue",
    "britishairways",
    "virginatlantic",
    "jetblue",
    "singapore",
  ],
  "citi thankyou": ["american", "jetblue", "singapore", "virginatlantic", "flyingblue"],
  "capital one": ["aeroplan", "flyingblue", "britishairways", "virginatlantic", "singapore", "jetblue"],
  "bilt rewards": ["united", "aeroplan", "virginatlantic", "flyingblue", "hyatt"],
};

/** Genome / human labels → Seats.aero slug */
export const PROGRAM_SLUGS: Record<string, string> = {
  alaska: "alaska",
  "alaska mileage plan": "alaska",
  "mileage plan": "alaska",
  american: "american",
  "american aadvantage": "american",
  aadvantage: "american",
  united: "united",
  "united mileageplus": "united",
  mileageplus: "united",
  delta: "delta",
  "delta skymiles": "delta",
  skymiles: "delta",
  aeroplan: "aeroplan",
  virginatlantic: "virginatlantic",
  "virgin atlantic": "virginatlantic",
  flyingblue: "flyingblue",
  "air france flying blue": "flyingblue",
  britishairways: "britishairways",
  "british airways": "britishairways",
  jetblue: "jetblue",
  hyatt: "hyatt",
  "world of hyatt": "hyatt",
  singapore: "singapore",
  iberia: "iberia",
};

export function normalizeProgramSlug(label: string): string {
  const key = label.trim().toLowerCase();
  return PROGRAM_SLUGS[key] ?? key.replace(/\s+/g, "");
}

export interface ReachableProgram {
  slug: string;
  label: string;
  balance: number;
  fundedBy?: string;
  transferBonusPct?: number;
}

export async function resolveReachablePrograms(balances: Array<{ program: string; balance: number }>): Promise<ReachableProgram[]> {
  const bonuses = await kvStoreGet<Record<string, number>>(TRANSFER_BONUSES_KEY, { userId: "global" });
  const reachable: ReachableProgram[] = [];
  const seen = new Set<string>();

  for (const row of balances) {
    const programKey = row.program.trim().toLowerCase();
    const directSlug = normalizeProgramSlug(row.program);
    if (directSlug && !seen.has(directSlug)) {
      seen.add(directSlug);
      reachable.push({ slug: directSlug, label: row.program, balance: row.balance });
    }

    const partners = TRANSFER_PARTNERS[programKey];
    if (!partners) continue;
    for (const slug of partners) {
      if (seen.has(slug)) continue;
      seen.add(slug);
      const bonusKey = `${programKey.replace(/\s+/g, "_")}->${slug}`;
      reachable.push({
        slug,
        label: slug,
        balance: row.balance,
        fundedBy: row.program,
        transferBonusPct: bonuses?.[bonusKey] ?? 0,
      });
    }
  }

  return reachable;
}
