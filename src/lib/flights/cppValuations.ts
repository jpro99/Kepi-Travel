import { kvStoreGet } from "@/lib/travelAssistant/kvStore";
import type { AwardOffer, CashOffer, PaymentVerdict } from "@/lib/flights/types";

const CPP_VALUATIONS_KEY = "flights:cpp_valuations";

/** Default cents-per-point when Redis override absent */
const DEFAULT_CPP: Record<string, number> = {
  alaska: 1.8,
  american: 1.5,
  united: 1.4,
  delta: 1.2,
  aeroplan: 1.5,
  virginatlantic: 1.6,
  flyingblue: 1.3,
  britishairways: 1.4,
  jetblue: 1.3,
  hyatt: 1.7,
  chase_ur: 1.5,
  amex_mr: 1.5,
  citi_tyy: 1.4,
};

export function computeCpp(cashUsd: number, miles: number, taxesUsd = 0): number {
  if (miles <= 0) return 0;
  const netCashSaved = Math.max(0, cashUsd - taxesUsd);
  return Math.round((netCashSaved / miles) * 1000) / 10;
}

export async function resolveCppForProgram(programSlug: string): Promise<number> {
  const overrides = await kvStoreGet<Record<string, number>>(CPP_VALUATIONS_KEY, {
    userId: "global",
  });
  const key = programSlug.toLowerCase();
  return overrides?.[key] ?? DEFAULT_CPP[key] ?? 1.4;
}

export interface CashVsPointsDecision {
  verdict: PaymentVerdict;
  cpp: number;
  savingsUsd: number;
  imputedPointsUsd: number;
  reasoning: string;
}

export async function decideCashVsPoints(input: {
  cash: CashOffer | null;
  award: AwardOffer | null;
  userBalance?: number;
  baselineCpp?: number;
}): Promise<CashVsPointsDecision> {
  const { cash, award } = input;
  if (!cash && !award) {
    return {
      verdict: "use_cash",
      cpp: 0,
      savingsUsd: 0,
      imputedPointsUsd: 0,
      reasoning: "No live cash or award offers returned.",
    };
  }
  if (!award) {
    return {
      verdict: "use_cash",
      cpp: 0,
      savingsUsd: 0,
      imputedPointsUsd: cash?.totalUsd ?? 0,
      reasoning: `Book cash — $${cash?.totalUsd.toLocaleString() ?? "?"} on ${cash?.airline ?? "Duffel"}.`,
    };
  }
  if (!cash) {
    return {
      verdict: award.fundedBy ? "transfer_points" : "use_points",
      cpp: 0,
      savingsUsd: 0,
      imputedPointsUsd: 0,
      reasoning: `Award only — ${award.miles.toLocaleString()} ${award.program} miles · verify on Seats.aero.`,
    };
  }

  const cpp = computeCpp(cash.totalUsd, award.miles, award.taxesUsd);
  const baseline = input.baselineCpp ?? (await resolveCppForProgram(award.programSlug));
  const balance = input.userBalance ?? 0;
  const netCash = cash.totalUsd;
  const awardOop = award.taxesUsd;
  const savingsUsd = Math.round(netCash - awardOop);

  if (balance > 0 && award.miles > balance && award.fundedBy) {
    return {
      verdict: "insufficient_points",
      cpp,
      savingsUsd,
      imputedPointsUsd: Math.round((award.miles * baseline) / 100),
      reasoning: `Need ${award.miles.toLocaleString()} miles but only ${balance.toLocaleString()} available via ${award.fundedBy}.`,
    };
  }

  if (cpp >= baseline && savingsUsd > 25) {
    const transferNote = award.fundedBy ? ` Transfer ${award.miles.toLocaleString()} from ${award.fundedBy}.` : "";
    return {
      verdict: award.fundedBy ? "transfer_points" : "use_points",
      cpp,
      savingsUsd,
      imputedPointsUsd: Math.round((award.miles * baseline) / 100),
      reasoning: `${cpp.toFixed(1)}¢/pt beats your ${baseline}¢ floor — save ~$${savingsUsd.toLocaleString()} vs $${netCash.toLocaleString()} cash.${transferNote}`,
    };
  }

  return {
    verdict: "use_cash",
    cpp,
    savingsUsd: 0,
    imputedPointsUsd: netCash,
    reasoning: `Cash wins — $${netCash.toLocaleString()} beats ${award.miles.toLocaleString()} miles at ${cpp.toFixed(1)}¢/pt (floor ${baseline}¢).`,
  };
}

export function rankScore(option: { verdict: PaymentVerdict; cashUsd: number; savingsUsd: number; cpp: number }): number {
  if (option.verdict === "use_points" || option.verdict === "transfer_points") {
    return option.cashUsd - option.savingsUsd;
  }
  return option.cashUsd;
}
