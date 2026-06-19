import { decideCashVsPoints, rankScore } from "@/lib/flights/cppValuations";
import { fetchDuffelCashOffers } from "@/lib/flights/duffelAdapter";
import { getLoyaltyBalances } from "@/lib/flights/loyaltyBalances";
import { searchSeatsAeroAwards, isSeatsAeroConfigured } from "@/lib/flights/seatsAero";
import { resolveReachablePrograms } from "@/lib/flights/transferPartners";
import type {
  AwardOffer,
  CashOffer,
  FusedFlightOption,
  FusedFlightSearchParams,
  FusedFlightSearchResult,
} from "@/lib/flights/types";

function bestCashForRoute(cashOffers: CashOffer[], award: AwardOffer): CashOffer | null {
  const matches = cashOffers.filter(
    (c) =>
      c.origin === award.origin &&
      c.destination === award.destination &&
      c.departureDate === award.departureDate,
  );
  if (matches.length === 0) return cashOffers[0] ?? null;
  return matches.sort((a, b) => a.totalUsd - b.totalUsd)[0] ?? null;
}

function balanceForAward(
  balances: Array<{ program: string; balance: number; baselineCpp?: number }>,
  award: AwardOffer,
): { balance: number; baselineCpp?: number } {
  const slug = award.programSlug.toLowerCase();
  const direct = balances.find((b) => b.program.toLowerCase().includes(slug));
  if (direct) return { balance: direct.balance, baselineCpp: direct.baselineCpp };
  if (award.fundedBy) {
    const bank = balances.find((b) => b.program.toLowerCase() === award.fundedBy!.toLowerCase());
    if (bank) return { balance: bank.balance, baselineCpp: bank.baselineCpp };
  }
  return { balance: 0 };
}

async function fuseOffers(
  cashOffers: CashOffer[],
  awardOffers: AwardOffer[],
  balances: Array<{ program: string; balance: number; baselineCpp?: number }>,
  cabin: FusedFlightSearchParams["cabin"],
): Promise<FusedFlightOption[]> {
  const fused: FusedFlightOption[] = [];
  const usedCash = new Set<string>();

  for (const award of awardOffers) {
    const cash = bestCashForRoute(cashOffers, award);
    if (cash) usedCash.add(cash.id);
    const { balance, baselineCpp } = balanceForAward(balances, award);
    const decision = await decideCashVsPoints({ cash, award, userBalance: balance, baselineCpp });

    fused.push({
      id: `fused-${award.id}`,
      origin: award.origin,
      destination: award.destination,
      departureDate: award.departureDate,
      cabin: cabin ?? "economy",
      cashOffer: cash,
      awardOffer: award,
      verdict: decision.verdict,
      headline:
        decision.verdict === "use_cash"
          ? `$${cash?.totalUsd.toLocaleString() ?? "?"} cash · ${award.airlines || award.program}`
          : `${award.miles.toLocaleString()} ${award.program} · ${decision.cpp.toFixed(1)}¢/pt`,
      reasoning: decision.reasoning,
      cpp: decision.cpp,
      cashUsd: cash?.totalUsd ?? 0,
      milesRequired: award.miles,
      imputedPointsUsd: decision.imputedPointsUsd,
      savingsUsd: decision.savingsUsd,
      rankScore: rankScore({
        verdict: decision.verdict,
        cashUsd: cash?.totalUsd ?? 0,
        savingsUsd: decision.savingsUsd,
        cpp: decision.cpp,
      }),
    });
  }

  for (const cash of cashOffers) {
    if (usedCash.has(cash.id)) continue;
    const decision = await decideCashVsPoints({ cash, award: null });
    fused.push({
      id: `fused-cash-${cash.id}`,
      origin: cash.origin,
      destination: cash.destination,
      departureDate: cash.departureDate,
      cabin: cash.cabin,
      cashOffer: cash,
      awardOffer: null,
      verdict: "use_cash",
      headline: `$${cash.totalUsd.toLocaleString()} cash · ${cash.airline}`,
      reasoning: decision.reasoning,
      cpp: 0,
      cashUsd: cash.totalUsd,
      milesRequired: 0,
      imputedPointsUsd: cash.totalUsd,
      savingsUsd: 0,
      rankScore: cash.totalUsd,
    });
  }

  return fused.sort((a, b) => a.rankScore - b.rankScore);
}

function buildHeadline(best: FusedFlightOption | null, cashCount: number, awardCount: number): string {
  if (!best) {
    return cashCount || awardCount ? "No fused options ranked." : "No live cash or award offers returned.";
  }
  if (best.verdict === "use_cash") {
    return `Best: ${best.headline}${best.awardOffer ? " — cash beats points on this route" : ""}`;
  }
  return `Best: ${best.headline} — saves ~$${best.savingsUsd.toLocaleString()} vs cash`;
}

/** Fuses live Duffel cash + Seats.aero awards with user balances and CPP verdict. */
export async function runFusedFlightSearch(
  params: FusedFlightSearchParams,
  userId: string,
): Promise<FusedFlightSearchResult> {
  const cabin = params.cabin ?? "economy";
  const balances = await getLoyaltyBalances(userId);
  const reachable = await resolveReachablePrograms(balances);

  const [cashResult, awardResult] = await Promise.all([
    fetchDuffelCashOffers({
      origins: params.origins,
      destination: params.destination,
      departureDate: params.departureDate,
      cabin,
    }),
    searchSeatsAeroAwards({
      origins: params.origins,
      destination: params.destination,
      departureDate: params.departureDate,
      cabin,
      reachablePrograms: reachable,
    }),
  ]);

  const fused = await fuseOffers(cashResult.offers, awardResult.offers, balances, cabin);
  const best = fused[0] ?? null;
  const headline = buildHeadline(best, cashResult.offers.length, awardResult.offers.length);

  return {
    params: { ...params, cabin },
    cashOffers: cashResult.offers,
    awardOffers: awardResult.offers,
    fused,
    headline,
    best,
    meta: {
      cashSource: cashResult.configured ? "duffel" : "none",
      awardSource: awardResult.configured ? "seats_aero" : "none",
      duffelConfigured: cashResult.configured,
      seatsAeroConfigured: isSeatsAeroConfigured(),
    },
  };
}
