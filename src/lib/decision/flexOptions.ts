import {
  buildSeatsAeroSearchUrl,
  estimateAwardMiles,
  formatDateShiftLabel,
} from "@/lib/decision/awardFlexEstimate";
import type { StrategyFlexOption, StrategyKind, TravelStrategy, TripIntent } from "@/lib/decision/types";
import {
  DEFAULT_DATE_SHIFTS,
  searchDuffelAcrossDates,
  shiftIsoDate,
} from "@/lib/providers/duffel/flexFlightSearch";

function hotelCashFromStrategy(strategy: TravelStrategy): number {
  return strategy.segments.filter((s) => s.mode === "hotel").reduce((sum, s) => sum + s.costUsd, 0);
}

function baselineAwardMiles(strategy: TravelStrategy): number {
  const awardSeg = strategy.segments.find((s) => s.milesUsed && s.mode === "flight");
  return awardSeg?.milesUsed ?? 70_000;
}

function baselineCpp(strategy: TravelStrategy): number {
  const awardSeg = strategy.segments.find((s) => s.cpp && s.mode === "flight");
  return awardSeg?.cpp ?? 2.0;
}

function totalValueScore(option: StrategyFlexOption, cpp: number): number {
  return option.trueOutOfPocket + ((option.milesUsed ?? 0) * cpp) / 100;
}

function dedupeAndTakeTop3(candidates: StrategyFlexOption[], cpp: number): StrategyFlexOption[] {
  const seen = new Set<string>();
  const unique: StrategyFlexOption[] = [];
  for (const c of candidates.sort((a, b) => totalValueScore(a, cpp) - totalValueScore(b, cpp))) {
    const key = `${c.departureDate}-${c.milesUsed ?? 0}-${Math.round(c.trueOutOfPocket)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
    if (unique.length >= 3) break;
  }
  return unique.map((o, i) => ({ ...o, rank: i + 1 }));
}

async function buildRepositionAwardOptions(
  strategy: TravelStrategy,
  intent: TripIntent,
): Promise<StrategyFlexOption[]> {
  const baseDate = intent.startDate;
  const baseMiles = baselineAwardMiles(strategy);
  const cpp = baselineCpp(strategy);
  const hotelCash = hotelCashFromStrategy(strategy);
  const baselineCash = strategy.scores.trueOutOfPocket;

  const feederOrigin = intent.originAirports?.[0]?.toUpperCase() ?? strategy.departureAirports[0];
  if (!feederOrigin) return [];
  const gateway =
    strategy.departureAirports.find((code) => code !== feederOrigin) ??
    intent.originAirports?.[1]?.toUpperCase() ??
    null;
  const longHaulDest = intent.stops?.[0]?.iata ?? intent.destinationIata;

  if (!gateway || gateway === feederOrigin) {
    const directCash = await searchDuffelAcrossDates({
      origins: [feederOrigin],
      destination: longHaulDest,
      baseDepartureDate: baseDate,
      cabinClass: "business",
    });
    const cashByShift = new Map(directCash.map((q) => [q.dateShiftDays, q]));
    const candidates: StrategyFlexOption[] = [];
    for (const shift of DEFAULT_DATE_SHIFTS) {
      const departureDate = shiftIsoDate(baseDate, shift);
      const cashBench = cashByShift.get(shift);
      const miles = estimateAwardMiles({
        baseMiles,
        origin: feederOrigin,
        destination: longHaulDest,
        departureDate,
        cabin: "business",
      });
      const trueOutOfPocket = Math.round((cashBench?.totalAmountUsd ?? 650) * 0.15 + hotelCash + 5.6);
      candidates.push({
        rank: 0,
        departureDate,
        dateShiftDays: shift,
        dateLabel: formatDateShiftLabel(departureDate, shift),
        headline: `${feederOrigin} → ${longHaulDest}`,
        trueOutOfPocket,
        milesUsed: miles,
        centsPerMile: cashBench
          ? Math.round((cashBench.totalAmountUsd / miles) * 1000) / 10
          : cpp,
        cashFareUsd: cashBench?.totalAmountUsd,
        pricingSource: cashBench ? "live" : "estimated",
        detail: cashBench
          ? `${cashBench.airline} · $${cashBench.totalAmountUsd} cash benchmark`
          : `${miles.toLocaleString()} mi (est.) from ${feederOrigin}`,
        verifyUrl: buildSeatsAeroSearchUrl({
          origin: feederOrigin,
          destination: longHaulDest,
          departureDate,
        }),
      });
    }
    return dedupeAndTakeTop3(candidates, cpp);
  }

  const [repositionQuotes, longHaulCash] = await Promise.all([
    searchDuffelAcrossDates({
      origins: [feederOrigin],
      destination: gateway,
      baseDepartureDate: baseDate,
      cabinClass: "economy",
    }),
    searchDuffelAcrossDates({
      origins: [gateway],
      destination: longHaulDest,
      baseDepartureDate: baseDate,
      cabinClass: "business",
    }),
  ]);

  const repositionByShift = new Map(repositionQuotes.map((q) => [q.dateShiftDays, q]));
  const cashByShift = new Map(longHaulCash.map((q) => [q.dateShiftDays, q]));

  const candidates: StrategyFlexOption[] = [];

  for (const shift of DEFAULT_DATE_SHIFTS) {
    const departureDate = shiftIsoDate(baseDate, shift);
    const reposition = repositionByShift.get(shift);
    const cashBench = cashByShift.get(shift);
    const miles = estimateAwardMiles({
      baseMiles,
      origin: gateway,
      destination: longHaulDest,
      departureDate,
      cabin: "business",
    });
    const repositionUsd = reposition?.totalAmountUsd ?? 89;
    const taxes = 5.6;
    const trueOutOfPocket = Math.round(repositionUsd + taxes + hotelCash);
    const impliedValue = cashBench ? cashBench.totalAmountUsd - trueOutOfPocket : miles * (cpp / 100);

    candidates.push({
      rank: 0,
      departureDate,
      dateShiftDays: shift,
      dateLabel: formatDateShiftLabel(departureDate, shift),
      headline: `${feederOrigin} → ${gateway} → ${longHaulDest}`,
      trueOutOfPocket,
      milesUsed: miles,
      centsPerMile: cashBench
        ? Math.round((cashBench.totalAmountUsd / miles) * 1000) / 10
        : cpp,
      cashFareUsd: cashBench?.totalAmountUsd,
      pricingSource: cashBench ? "mixed" : "estimated",
      detail: reposition
        ? `${reposition.airline} feeder $${repositionUsd} · ${miles.toLocaleString()} mi partner J (est.)`
        : `${miles.toLocaleString()} mi partner J (est.) · feeder ~$${repositionUsd}`,
      savingsVsBaseline:
        shift === 0
          ? undefined
          : Math.round(
              baselineCash -
                trueOutOfPocket -
                ((baseMiles - miles) * cpp) / 100,
            ),
      verifyUrl: buildSeatsAeroSearchUrl({
        origin: gateway,
        destination: longHaulDest,
        departureDate,
      }),
      benchmarkNote: cashBench
        ? `Business cash benchmark ${cashBench.airline}: $${cashBench.totalAmountUsd.toLocaleString()} (${impliedValue > 0 ? `~$${Math.round(impliedValue)} value vs cash` : "compare on Seats.aero"})`
        : "Award miles are estimated — verify on Seats.aero",
    });
  }

  return dedupeAndTakeTop3(candidates, cpp);
}

async function buildDirectCashOptions(
  strategy: TravelStrategy,
  intent: TripIntent,
  searchAirports: string[],
): Promise<StrategyFlexOption[]> {
  const baseDate = intent.startDate;
  const hotelCash = hotelCashFromStrategy(strategy);
  const baselineCash = strategy.scores.trueOutOfPocket;
  const cabin = strategy.segments.some((s) => s.detail.includes("premium"))
    ? "premium_economy"
    : "economy";

  const quotes = await searchDuffelAcrossDates({
    origins: searchAirports.slice(0, 3),
    destination: intent.destinationIata,
    baseDepartureDate: baseDate,
    cabinClass: cabin,
  });

  const candidates: StrategyFlexOption[] = quotes.map((q) => {
    const trueOutOfPocket = Math.round(q.totalAmountUsd + hotelCash);
    const stopLabel = q.stops === 0 ? "nonstop" : `${q.stops} stop${q.stops > 1 ? "s" : ""}`;
    return {
      rank: 0,
      departureDate: q.departureDate,
      dateShiftDays: q.dateShiftDays,
      dateLabel: formatDateShiftLabel(q.departureDate, q.dateShiftDays),
      headline: `${q.origin} → ${q.destination} · ${stopLabel}`,
      trueOutOfPocket,
      cashFareUsd: q.totalAmountUsd,
      pricingSource: "live" as const,
      detail: `${q.airline} · live Duffel ${q.cabinClass} · $${q.totalAmountUsd.toLocaleString()} fare`,
      savingsVsBaseline:
        q.dateShiftDays === 0 ? undefined : Math.round(baselineCash - trueOutOfPocket),
    };
  });

  if (candidates.length === 0) {
    return [
      {
        rank: 1,
        departureDate: baseDate,
        dateShiftDays: 0,
        dateLabel: formatDateShiftLabel(baseDate, 0),
        headline: strategy.headline,
        trueOutOfPocket: baselineCash,
        pricingSource: "estimated",
        detail: "No live Duffel fares returned — showing modeled playbook numbers.",
      },
    ];
  }

  return dedupeAndTakeTop3(candidates, 0);
}

async function buildInstrumentOrStatusOptions(
  strategy: TravelStrategy,
  intent: TripIntent,
  searchAirports: string[],
): Promise<StrategyFlexOption[]> {
  const origin = strategy.departureAirports[0] ?? searchAirports[0];
  if (!origin) return [];
  const baseDate = intent.startDate;
  const hotelCash = hotelCashFromStrategy(strategy);
  const baselineCash = strategy.scores.trueOutOfPocket;
  const baseMiles = baselineAwardMiles(strategy);

  const quotes = await searchDuffelAcrossDates({
    origins: [origin],
    destination: intent.destinationIata,
    baseDepartureDate: baseDate,
    cabinClass: "economy",
  });

  const candidates: StrategyFlexOption[] = [];

  for (const shift of DEFAULT_DATE_SHIFTS) {
    const departureDate = shiftIsoDate(baseDate, shift);
    const live = quotes.find((q) => q.dateShiftDays === shift);
    const miles =
      baseMiles > 0
        ? estimateAwardMiles({
            baseMiles,
            origin,
            destination: intent.destinationIata,
            departureDate,
            cabin: "economy",
          })
        : undefined;
    const flightCash = live?.totalAmountUsd ?? strategy.segments.find((s) => s.mode === "flight")?.costUsd ?? 0;
    const trueOutOfPocket = Math.round(flightCash + hotelCash);

    candidates.push({
      rank: 0,
      departureDate,
      dateShiftDays: shift,
      dateLabel: formatDateShiftLabel(departureDate, shift),
      headline: `${origin} → ${intent.destinationIata}`,
      trueOutOfPocket,
      milesUsed: miles,
      cashFareUsd: live?.totalAmountUsd,
      pricingSource: live ? (miles ? "mixed" : "live") : "estimated",
      detail: live
        ? `${live.airline} · $${live.totalAmountUsd.toLocaleString()}${miles ? ` + ${miles.toLocaleString()} mi est.` : ""}`
        : strategy.segments.find((s) => s.mode === "flight")?.detail ?? "Modeled segment",
      savingsVsBaseline:
        shift === 0 ? undefined : Math.round(baselineCash - trueOutOfPocket),
      verifyUrl: miles
        ? buildSeatsAeroSearchUrl({ origin, destination: intent.destinationIata, departureDate })
        : undefined,
    });
  }

  return dedupeAndTakeTop3(candidates, baselineCpp(strategy));
}

export async function buildStrategyFlexOptions(input: {
  strategy: TravelStrategy;
  kind: StrategyKind;
  intent: TripIntent;
  searchAirports: string[];
}): Promise<{
  options: StrategyFlexOption[];
  baselineDate: string;
  notice: string;
}> {
  const { strategy, kind, intent, searchAirports } = input;

  let options: StrategyFlexOption[];
  let notice: string;

  switch (kind) {
    case "reposition_award":
      options = await buildRepositionAwardOptions(strategy, intent);
      notice =
        "Top 3 by lowest true cost. Feeder fares are live Duffel; partner award miles are date-modeled — verify on Seats.aero before booking.";
      break;
    case "direct_cash":
      options = await buildDirectCashOptions(strategy, intent, searchAirports);
      notice = "All fares below are live Duffel cash quotes across nearby dates.";
      break;
    default:
      options = await buildInstrumentOrStatusOptions(strategy, intent, searchAirports);
      notice =
        "Cash segments are live Duffel where available; miles/cert value stays modeled from your genome.";
      break;
  }

  return {
    options,
    baselineDate: intent.startDate,
    notice,
  };
}
