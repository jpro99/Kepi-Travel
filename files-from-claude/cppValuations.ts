// src/lib/flights/cppValuations.ts
// The comparison brain. Converts award prices into a cash-equivalent so the UI
// can say "book with points, you save $340" — the thing Points Path does and
// almost nobody fuses with a real booking engine.
//
// NOTE: these baseline valuations are reasonable industry medians as of early
// 2026. The *better* long-term design (Points Path's actual edge) is to compute
// these dynamically from your own Duffel cash data daily and cache them in
// Redis. A hook for that is provided at the bottom (getProgramValuations).

import type { AwardOffer, CashOffer, LoyaltyProgram } from "./types";

// Cents-per-point baseline value (how much 1 point is conservatively worth).
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
  // Transferable bank currencies (valued at best-use, since they flex)
  chase_ur: 2.0,
  amex_mr: 2.0,
  capitalone: 1.85,
  citi_typ: 1.8,
  bilt: 1.9,
  wellsfargo: 1.8,
};

// Programs notorious for fuel/carrier-imposed surcharges. We flag these so a
// "cheap" mileage price isn't misleading once you add the cash component.
export const SURCHARGE_HEAVY: ReadonlySet<LoyaltyProgram> = new Set([
  "avios_ba",
  "virginatlantic",
  "flyingblue",
  "emirates",
]);

export function getBaselineCpp(program: LoyaltyProgram): number {
  return BASELINE_CPP[program] ?? 1.3; // safe floor for unknown programs
}

// The cash-equivalent of an award offer:
//   (miles * cpp) + surcharge
// i.e. what you'd "spend" in dollars-of-value to take this award.
export function awardCashEquivalent(
  offer: AwardOffer,
  cppOverride?: number
): number {
  const cpp = cppOverride ?? getBaselineCpp(offer.program);
  const milesValueCents = Math.round(offer.milesCost * cpp);
  return milesValueCents + offer.cashSurcharge;
}

// The value you actually EXTRACT per point on this redemption, measured against
// the real cash fare for the same trip. This is the honest "is this a good
// redemption?" number. > baseline CPP = good deal; < baseline = poor.
export function realizedCpp(
  award: AwardOffer,
  comparableCashOffer: CashOffer | undefined
): number | undefined {
  if (!comparableCashOffer || award.milesCost <= 0) return undefined;
  const cashYouAvoid = comparableCashOffer.totalAmount - award.cashSurcharge;
  if (cashYouAvoid <= 0) return 0;
  // cents of value per point
  return Number((cashYouAvoid / award.milesCost).toFixed(2));
}

export interface CashVsPointsDecision {
  winner: "cash" | "points";
  cashTotal: number; // cents
  awardCashEquivalent: number; // cents
  savings: number; // cents saved by taking the winner vs the loser
  realizedCpp?: number;
  reason: string;
}

// The single most useful output: given the cheapest cash fare and a candidate
// award, tell the user which to book and why.
export function decideCashVsPoints(
  cash: CashOffer,
  award: AwardOffer,
  cppOverride?: number
): CashVsPointsDecision {
  const awardEquiv = awardCashEquivalent(award, cppOverride);
  const cashTotal = cash.totalAmount;
  const rCpp = realizedCpp(award, cash);

  if (awardEquiv < cashTotal) {
    const savings = cashTotal - awardEquiv;
    const cppNote = rCpp ? ` (≈${rCpp}¢/pt)` : "";
    return {
      winner: "points",
      cashTotal,
      awardCashEquivalent: awardEquiv,
      savings,
      realizedCpp: rCpp,
      reason:
        `Book with ${labelFor(award.program)} points${cppNote} — ` +
        `effectively ${formatUsd(awardEquiv)} vs ${formatUsd(cashTotal)} cash, ` +
        `saving ${formatUsd(savings)}.` +
        (award.surchargeHeavy
          ? " Heads up: this program carries heavy surcharges, already included above."
          : ""),
    };
  }

  const savings = awardEquiv - cashTotal;
  return {
    winner: "cash",
    cashTotal,
    awardCashEquivalent: awardEquiv,
    savings,
    realizedCpp: rCpp,
    reason:
      `Pay cash — ${formatUsd(cashTotal)} beats burning ${award.milesCost.toLocaleString()} ` +
      `${labelFor(award.program)} points (worth ~${formatUsd(awardEquiv)}). Save the points.`,
  };
}

// --- helpers ---------------------------------------------------------------

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

// Optional: dynamic valuations cached in Redis (the Points-Path-style upgrade).
// Wire this to a daily job that computes medians from your own search data.
// Falls back to baselines if nothing is cached.
export async function getProgramValuations(): Promise<
  Record<LoyaltyProgram, number>
> {
  try {
    // Lazy import keeps this module usable in edge contexts without Redis.
    const { kvStoreGet } = await import("@/lib/redis");
    const cached = await kvStoreGet("flights:cpp_valuations");
    if (cached && typeof cached === "object") {
      return { ...BASELINE_CPP, ...(cached as Record<LoyaltyProgram, number>) };
    }
  } catch {
    // ignore — fall through to baseline
  }
  return { ...BASELINE_CPP };
}
