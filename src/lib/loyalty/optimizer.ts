// Points vs Cash optimizer — the core intelligence engine

import { getProgramById, getProgramByIata, LOYALTY_PROGRAMS } from "./programs";

export interface LoyaltyBalance {
  programId: string;
  miles: number;
  tier?: string;
}

export interface CostOption {
  type: "cash" | "points" | "hybrid";
  label: string;
  cashAmount: number;
  milesUsed?: number;
  programId?: string;
  programName?: string;
  cppAchieved?: number;       // cents per point you're getting
  cppBaseline?: number;       // baseline CPP for this program
  recommendation: "use" | "avoid" | "consider";
  reason: string;
  savings?: number;           // vs the cash price
}

export interface TrueCost {
  baseFare: number;
  bagFee: number;
  seatFee: number;
  transportToAirport: number;
  airportFood: number;
  total: number;
  breakdown: { label: string; amount: number; note?: string }[];
}

// Bag fee estimates by airline
const BAG_FEES: Record<string, number> = {
  AS: 30, DL: 35, UA: 35, AA: 35, WN: 0,  // Southwest free
  B6: 35, NK: 49, F9: 49, G4: 25,
  // International — usually included
  BA: 0, AF: 0, LH: 0, EK: 0, SQ: 0, TK: 0,
};

// Transport estimates by airport (one-way to airport)
const AIRPORT_TRANSPORT: Record<string, number> = {
  LAX: 45, ONT: 25, SNA: 30, SFO: 55, SAN: 30,
  JFK: 65, LGA: 45, EWR: 55, ORD: 35, MDW: 30,
  MIA: 35, FLL: 40, ATL: 35, DFW: 40, IAH: 40,
  SEA: 40, DEN: 30, PHX: 30, LAS: 25, BOS: 35,
  IAD: 55, DCA: 35, PHL: 35,
};

export function calcTrueCost(
  baseFare: number,
  airlineIata: string,
  cabin: string,
  fromAirport: string,
  includeReturn = false,
): TrueCost {
  const isBusiness = cabin === "business" || cabin === "first";
  const isBudget = ["NK", "F9", "G4"].includes(airlineIata.toUpperCase());

  const bagFee = isBusiness ? 0 : (BAG_FEES[airlineIata.toUpperCase()] ?? 30);
  const seatFee = isBusiness ? 0 : isBudget ? 25 : 15;
  const transport = (AIRPORT_TRANSPORT[fromAirport.toUpperCase()] ?? 35) * (includeReturn ? 2 : 1);
  const food = 20;

  const total = baseFare + bagFee + seatFee + transport + food;

  return {
    baseFare,
    bagFee,
    seatFee,
    transportToAirport: transport,
    airportFood: food,
    total,
    breakdown: [
      { label: "Base fare", amount: baseFare },
      { label: "Checked bag (1)", amount: bagFee, note: bagFee === 0 ? "Included" : undefined },
      { label: "Seat selection", amount: seatFee },
      { label: "Airport transport", amount: transport },
      { label: "Airport food est.", amount: food },
    ].filter(b => b.amount > 0 || b.note),
  };
}

export function calcPointsOptions(
  cashPrice: number,
  airlineIata: string,
  balances: LoyaltyBalance[],
): CostOption[] {
  const options: CostOption[] = [];

  // Cash option always first
  options.push({
    type: "cash",
    label: "Pay cash",
    cashAmount: cashPrice,
    recommendation: "consider",
    reason: `$${cashPrice} out of pocket`,
  });

  const airline = getProgramByIata(airlineIata);

  for (const balance of balances) {
    const program = getProgramById(balance.programId);
    if (!program || balance.miles < 1000) continue;

    const cppBaseline = program.cppEstimate;
    const milesNeeded = Math.ceil((cashPrice / (cppBaseline / 100)));

    // Direct airline program match
    if (airline && program.id === airline.id) {
      if (balance.miles >= milesNeeded) {
        const cppAchieved = (cashPrice / milesNeeded) * 100;
        const rec = cppAchieved >= cppBaseline ? "use" : "avoid";
        options.push({
          type: "points",
          label: `Pay with ${program.shortName}`,
          cashAmount: 0,
          milesUsed: milesNeeded,
          programId: program.id,
          programName: program.shortName,
          cppAchieved,
          cppBaseline,
          recommendation: rec,
          reason: rec === "use"
            ? `Great deal — getting ${cppAchieved.toFixed(1)}¢/pt vs baseline ${cppBaseline}¢`
            : `Only ${cppAchieved.toFixed(1)}¢/pt — below the ${cppBaseline}¢ baseline. Pay cash.`,
          savings: rec === "use" ? cashPrice : undefined,
        });
      }
    }

    // Transferable currencies
    if (program.type === "transferable" && program.transferPartners && airline) {
      if (program.transferPartners.includes(airline.id)) {
        const transferMilesNeeded = Math.ceil(milesNeeded * 1.05); // small transfer overhead
        if (balance.miles >= transferMilesNeeded) {
          const cppAchieved = (cashPrice / transferMilesNeeded) * 100;
          const rec = cppAchieved >= 1.4 ? "use" : "consider";
          options.push({
            type: "points",
            label: `Transfer ${program.shortName} → ${airline.shortName}`,
            cashAmount: 0,
            milesUsed: transferMilesNeeded,
            programId: program.id,
            programName: program.shortName,
            cppAchieved,
            cppBaseline: program.cppEstimate,
            recommendation: rec,
            reason: rec === "use"
              ? `Transfer ${transferMilesNeeded.toLocaleString()} ${program.shortName} to ${airline.shortName}. Getting ${cppAchieved.toFixed(1)}¢/pt.`
              : `Possible but only ${cppAchieved.toFixed(1)}¢/pt — might not be worth it.`,
          });
        }
      }
    }
  }

  // Sort: best recommendation first
  const order = { use: 0, consider: 1, avoid: 2 };
  return options.sort((a, b) => order[a.recommendation] - order[b.recommendation]);
}

export function getBestOption(options: CostOption[]): CostOption {
  return options[0] ?? { type: "cash", label: "Pay cash", cashAmount: 0, recommendation: "consider", reason: "" };
}
