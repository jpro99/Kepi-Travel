import { kvStoreGet } from "@/lib/travelAssistant/kvStore";
import type { AwardOffer, CashOffer, LoyaltyProgram } from "./types";

const CPP_VALUATIONS_KEY = "flights:cpp_valuations";
const GLOBAL_USER = "global";

const BASELINE_CPP: Record<LoyaltyProgram, number> = {
  united: 1.35,
  american: 1.5,
  delta: 1.2,
  alaska: 1.5,
  jetblue: 1.3,
  southwest: 1.35,
  aeroplan: 1.5,
  flyingblue: 1.3,
  avios_ba: 1.4,
  avios_iberia: 1.4,
  virginatlantic: 1.4,
  lifemiles: 1.5,
  singapore_krisflyer: 1.45,
  ana: 1.6,
  emirates: 1.2,
  etihad: 1.3,
  qatar_avios: 1.4,
  turkish: 1.4,
  chase_ur: 2.0,
  amex_mr: 2.0,
  capitalone: 1.85,
  citi_typ: 1.8,
  bilt: 1.9,
  wellsfargo: 1.8,
};

export const SURCHARGE_HEAVY: ReadonlySet<LoyaltyProgram> = new Set([
  "avios_ba",
  "virginatlantic",
  "flyingblue",
  "emirates",
]);

export function getBaselineCpp(program: LoyaltyProgram): number {
  return BASELINE_CPP[program] ?? 1.3;
}

export function awardCashEquivalent(
  offer: AwardOffer,
  passengers = 1,
  cppOverride?: number,
): number {
  const pax = Math.max(1, passengers);
  const cpp = cppOverride ?? getBaselineCpp(offer.program);
  const milesValueCents = Math.round(offer.milesCost * pax * cpp);
  return milesValueCents + offer.cashSurcharge * pax;
}

export function realizedCpp(
  award: AwardOffer,
  comparableCashOffer: CashOffer | undefined,
  passengers = 1,
): number | undefined {
  if (!comparableCashOffer || award.milesCost <= 0) return undefined;
  const pax = Math.max(1, passengers);
  const totalMiles = award.milesCost * pax;
  const cashYouAvoid = comparableCashOffer.totalAmount - award.cashSurcharge * pax;
  if (cashYouAvoid <= 0) return 0;
  return Number((cashYouAvoid / totalMiles).toFixed(2));
}

export interface CashVsPointsDecision {
  winner: "cash" | "points";
  cashTotal: number;
  awardCashEquivalent: number;
  savings: number;
  realizedCpp?: number;
  totalMiles: number;
  reason: string;
}

export function decideCashVsPoints(
  cash: CashOffer,
  award: AwardOffer,
  passengers = 1,
  cppOverride?: number,
): CashVsPointsDecision {
  const pax = Math.max(1, passengers);
  const awardEquiv = awardCashEquivalent(award, pax, cppOverride);
  const cashTotal = cash.totalAmount;
  const rCpp = realizedCpp(award, cash, pax);
  const totalMiles = award.milesCost * pax;
  const paxNote = pax > 1 ? ` for ${pax} travelers` : "";

  if (awardEquiv < cashTotal) {
    const savings = cashTotal - awardEquiv;
    const cppNote = rCpp ? ` (~${rCpp}c/pt)` : "";
    return {
      winner: "points",
      cashTotal,
      awardCashEquivalent: awardEquiv,
      savings,
      realizedCpp: rCpp,
      totalMiles,
      reason:
        `Book with ${labelFor(award.program)} points${cppNote}${paxNote} — ` +
        `${totalMiles.toLocaleString()} pts effectively costs ${formatUsd(awardEquiv)} ` +
        `vs ${formatUsd(cashTotal)} cash, saving ${formatUsd(savings)}.` +
        (award.surchargeHeavy ? " Note: surcharge-heavy program, already included above." : ""),
    };
  }

  const savings = awardEquiv - cashTotal;
  return {
    winner: "cash",
    cashTotal,
    awardCashEquivalent: awardEquiv,
    savings,
    realizedCpp: rCpp,
    totalMiles,
    reason:
      `Pay cash${paxNote} — ${formatUsd(cashTotal)} beats burning ` +
      `${totalMiles.toLocaleString()} ${labelFor(award.program)} pts ` +
      `(worth ~${formatUsd(awardEquiv)}). Save the points.`,
  };
}

function formatUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

const PROGRAM_LABELS: Partial<Record<LoyaltyProgram, string>> = {
  chase_ur: "Chase UR",
  amex_mr: "Amex MR",
  capitalone: "Capital One",
  citi_typ: "Citi TYP",
  united: "United",
  american: "American",
  delta: "Delta",
  alaska: "Alaska",
  aeroplan: "Aeroplan",
  flyingblue: "Flying Blue",
  avios_ba: "BA Avios",
  lifemiles: "LifeMiles",
  singapore_krisflyer: "Singapore",
};

export function labelFor(program: LoyaltyProgram): string {
  return PROGRAM_LABELS[program] ?? program;
}

export async function getProgramValuations(): Promise<Record<LoyaltyProgram, number>> {
  try {
    const cached = await kvStoreGet<Record<LoyaltyProgram, number>>(CPP_VALUATIONS_KEY, {
      userId: GLOBAL_USER,
    });
    if (cached && typeof cached === "object") {
      return { ...BASELINE_CPP, ...cached };
    }
  } catch {
    /* fall through */
  }
  return { ...BASELINE_CPP };
}

/** Topology pricing helper — maps program slug to baseline CPP. */
export async function resolveCppForProgram(programSlug: string): Promise<number> {
  const valuations = await getProgramValuations();
  const key = programSlug.toLowerCase().replace(/\s+/g, "_") as LoyaltyProgram;
  return valuations[key] ?? getBaselineCpp(key);
}
