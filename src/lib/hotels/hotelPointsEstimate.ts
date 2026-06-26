import { getProgramById, LOYALTY_PROGRAMS, type LoyaltyProgram } from "@/lib/loyalty/programs";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";

export interface HotelPointsOption {
  programId: string;
  programName: string;
  milesNeeded: number;
  cppAchieved: number;
  cppBaseline: number;
  recommendation: "use" | "consider" | "avoid";
  reason: string;
  transferableFrom?: string;
}

function chainToProgramIds(chainName: string | undefined, hotelName: string): string[] {
  const haystack = `${chainName ?? ""} ${hotelName}`.toLowerCase();
  const matches: string[] = [];
  if (/hyatt|andaz|thompson|unbound|park hyatt|grand hyatt/.test(haystack)) matches.push("hyatt");
  if (/marriott|bonvoy|westin|sheraton|ritz|w hotel|st\. regis|autograph|moxy|aloft/.test(haystack)) matches.push("marriott");
  if (/hilton|waldorf|conrad|curio|tapestry|doubletree|embassy/.test(haystack)) matches.push("hilton");
  if (/\bihg\b|intercontinental|holiday inn|crowne plaza|kimpton|voco/.test(haystack)) matches.push("ihg");
  return matches;
}

function estimatePointsNeeded(totalCashUsd: number, cppBaseline: number): number {
  return Math.max(1, Math.ceil(totalCashUsd / (cppBaseline / 100)));
}

function buildOption(
  program: LoyaltyProgram,
  totalCashUsd: number,
  balanceMiles: number,
  transferableFrom?: string,
): HotelPointsOption | null {
  const milesNeeded = estimatePointsNeeded(totalCashUsd, program.cppEstimate);
  if (balanceMiles < milesNeeded) return null;
  const cppAchieved = (totalCashUsd / milesNeeded) * 100;
  const recommendation =
    cppAchieved >= program.cppEstimate ? "use" : cppAchieved >= program.cppEstimate * 0.85 ? "consider" : "avoid";
  return {
    programId: program.id,
    programName: program.shortName,
    milesNeeded,
    cppAchieved: Math.round(cppAchieved * 10) / 10,
    cppBaseline: program.cppEstimate,
    recommendation,
    reason:
      recommendation === "use"
        ? `Strong ${cppAchieved.toFixed(1)}¢/pt vs ${program.cppEstimate}¢ baseline`
        : recommendation === "consider"
          ? `${cppAchieved.toFixed(1)}¢/pt — close to baseline; compare cash`
          : `Only ${cppAchieved.toFixed(1)}¢/pt — cash is likely better`,
    transferableFrom,
  };
}

/** Estimate best hotel points play for a cash quote and wallet balances. */
export function estimateHotelPointsOptions(
  totalCashUsd: number,
  chainName: string | undefined,
  hotelName: string,
  balances: LoyaltyBalance[],
): HotelPointsOption[] {
  if (totalCashUsd <= 0) return [];

  const options: HotelPointsOption[] = [];
  const targetPrograms = chainToProgramIds(chainName, hotelName);

  for (const balance of balances) {
    const direct = getProgramById(balance.programId);
    if (direct?.type === "hotel" && targetPrograms.includes(direct.id)) {
      const option = buildOption(direct, totalCashUsd, balance.miles);
      if (option) options.push(option);
    }
  }

  for (const balance of balances) {
    const transferable = getProgramById(balance.programId);
    if (!transferable || transferable.type !== "transferable" || !transferable.transferPartners) continue;
    for (const partnerId of transferable.transferPartners) {
      if (!targetPrograms.includes(partnerId)) continue;
      const partner = getProgramById(partnerId);
      if (!partner || partner.type !== "hotel") continue;
      const transferMiles = Math.ceil(estimatePointsNeeded(totalCashUsd, partner.cppEstimate) * 1.05);
      const option = buildOption(partner, totalCashUsd, balance.miles, transferable.shortName);
      if (option && balance.miles >= transferMiles) {
        options.push({
          ...option,
          milesNeeded: transferMiles,
          cppAchieved: Math.round(((totalCashUsd / transferMiles) * 100) * 10) / 10,
          reason: `Transfer ${transferMiles.toLocaleString()} ${transferable.shortName} → ${partner.shortName}. ${option.reason}`,
        });
      }
    }
  }

  const order = { use: 0, consider: 1, avoid: 2 };
  return options.sort((a, b) => order[a.recommendation] - order[b.recommendation] || b.cppAchieved - a.cppAchieved);
}

export function bestHotelProgramForChain(chainName: string | undefined, hotelName: string): LoyaltyProgram | undefined {
  const ids = chainToProgramIds(chainName, hotelName);
  return ids.map((id) => getProgramById(id)).find(Boolean);
}

export function allHotelPrograms(): LoyaltyProgram[] {
  return LOYALTY_PROGRAMS.filter((program) => program.type === "hotel");
}
