import { buildInferredSummary, parseTripIntent } from "@/lib/decision/intentParser";
import { buildFlightLegsFromIntent, applyLegEnabledOverrides, annotateLegLoyaltyNotes } from "@/lib/decision/flightLegPlanner";
import { buildQuestionBudget } from "@/lib/decision/questionBudget";
import { rankStrategiesByValue } from "@/lib/decision/strategyRanking";
import { personalizeStrategiesForIntent } from "@/lib/decision/strategyPersonalization";
import {
  originRequiredForIntent,
  resolvePrimaryOrigin,
  resolveSearchAirports,
} from "@/lib/decision/tripOrigins";
import { filterStrategiesByPaymentMode, type PaymentMode } from "@/lib/decision/paymentMode";
import type {
  CounterfactualMutation,
  CounterfactualResult,
  DecisionBrief,
  PlanMode,
  TravelStrategy,
  TripIntent,
} from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";

const SOCAL_AIRPORTS = new Set(["LAX", "ONT", "SNA", "BUR", "SAN", "PSP"]);
const WEST_COAST_METRO = new Set(["LAX", "ONT", "SNA", "BUR", "SAN", "PSP", "SFO", "OAK", "SJC", "SEA"]);

function isSoCalOrigin(iata: string): boolean {
  return SOCAL_AIRPORTS.has(iata.toUpperCase());
}

function isWestCoastMetroOrigin(iata: string): boolean {
  return WEST_COAST_METRO.has(iata.toUpperCase());
}

function prefersAlaska(intent: TripIntent): boolean {
  return Boolean(
    intent.preferredAirlines?.includes("Alaska") ||
    intent.loyaltyPrograms?.some((program) => /alaska/i.test(program)),
  );
}

function returnFlightSegment(intent: TripIntent, homeIata: string, costUsd = 650): TravelStrategy["segments"][number] | null {
  const returnFrom = intent.returnAirports?.[0]?.toUpperCase();
  if (!returnFrom) return null;
  return {
    mode: "flight",
    label: `${returnFrom} → ${homeIata}`,
    detail: `Return · ${intent.returnCity ?? returnFrom} · ${intent.endDate}`,
    costUsd,
  };
}

function stripHotelSegments(strategy: TravelStrategy): TravelStrategy {
  const flightSegments = strategy.segments.filter((segment) => segment.mode !== "hotel");
  const returnCost = flightSegments
    .filter((segment) => segment.mode === "flight")
    .slice(1)
    .reduce((sum, segment) => sum + segment.costUsd, 0);
  const outboundCost = flightSegments.find((segment) => segment.mode === "flight")?.costUsd ?? 0;
  return {
    ...strategy,
    segments: flightSegments,
    scores: {
      ...strategy.scores,
      trueOutOfPocket: outboundCost + returnCost + strategy.segments
        .filter((segment) => segment.mode === "drive")
        .reduce((sum, segment) => sum + segment.costUsd, 0),
    },
  };
}

function appendReturnToStrategies(
  strategies: TravelStrategy[],
  intent: TripIntent,
  homeIata: string,
): TravelStrategy[] {
  const returnSegment = returnFlightSegment(intent, homeIata);
  if (!returnSegment) return strategies;

  return strategies.map((strategy) => {
    const hasReturn = strategy.segments.some(
      (segment) => segment.mode === "flight" && segment.label.startsWith(`${returnSegment.label.split(" → ")[0]} →`),
    );
    if (hasReturn) return strategy;

    const flightSegments = strategy.segments.filter((segment) => segment.mode === "flight");
    const otherSegments = strategy.segments.filter((segment) => segment.mode !== "flight");
    const outbound = flightSegments[0];
    const returnFrom = returnSegment.label.split(" → ")[0] ?? intent.returnAirports?.[0] ?? "";
    const returnTo = homeIata;
    const headline =
      outbound && strategy.kind === "direct_cash"
        ? `${outbound.label} · ${returnFrom} → ${returnTo} · round-trip cash`
        : strategy.headline;

    return {
      ...strategy,
      headline,
      reasoning: `${strategy.reasoning} Open-jaw return from ${intent.returnCity ?? returnFrom} on ${intent.endDate}.`,
      segments: [...otherSegments, ...flightSegments, returnSegment],
      scores: {
        ...strategy.scores,
        trueOutOfPocket: strategy.scores.trueOutOfPocket + returnSegment.costUsd,
      },
    };
  });
}

function toFlightOnlyStrategies(
  strategies: TravelStrategy[],
  intent: TripIntent,
  homeIata: string,
): TravelStrategy[] {
  const flightKinds = new Set<TravelStrategy["kind"]>(["direct_cash", "reposition_award", "instrument_play"]);
  return appendReturnToStrategies(
    strategies
      .filter((strategy) => flightKinds.has(strategy.kind))
      .map(stripHotelSegments)
      .slice(0, 3),
    intent,
    homeIata,
  );
}

function buildRouteStrategies(intent: TripIntent, genome: TravelerGenome): TravelStrategy[] {
  const suiteCert = genome.instruments.find((i) => i.type === "suite_certificate");
  const guestUpgrade = genome.instruments.find((i) => i.type === "guest_upgrade");
  const primaryHotel = genome.hotelChainPriority[0] ?? "Hyatt";

  const origin = resolvePrimaryOrigin(intent, genome);
  if (!origin) return [];

  const altOrigins = (intent.originAirports ?? []).map((c) => c.toUpperCase()).filter((c) => c !== origin);
  const dest = intent.destinationIata.toUpperCase();
  const destLabel = intent.stops?.[0]?.name ?? intent.destination;
  const soCal = isSoCalOrigin(origin);
  const preferAlaska = prefersAlaska(intent);
  const westCoastMetro = isWestCoastMetroOrigin(origin);
  const repositionHub =
    preferAlaska && westCoastMetro && origin !== "SEA"
      ? "SEA"
      : soCal
        ? "SEA"
        : altOrigins[0] ?? null;

  const hotelSegment = {
    mode: "hotel" as const,
    label: `${primaryHotel} ${destLabel}`,
    detail: "21k Hyatt points/night · Globalist breakfast + late checkout",
    costUsd: 0,
    milesUsed: 21_000,
    cpp: 1.7,
  };

  const strategies: TravelStrategy[] = [];

  if (genome.toleratesRepositioning && repositionHub && repositionHub !== origin && (soCal || preferAlaska)) {
    strategies.push({
      id: "reposition_award",
      kind: "reposition_award",
      title: preferAlaska ? "Alaska Reposition Play" : "Reposition Play",
      headline: `${origin} → ${repositionHub} · partner J to ${destLabel}`,
      reasoning: preferAlaska
        ? `Feeder to ${repositionHub} then partner business ~70k miles. Alaska MVP Gold often sees upgrade space on ${repositionHub} long-hauls vs flying direct from ${origin}.`
        : `Reposition to ${repositionHub} for partner business class at ~70k miles. Often beats a direct cash fare from ${origin} at 2.1¢/mi when award space opens.`,
      segments: [
        {
          mode: "drive",
          label: `Drive to ${origin}`,
          detail: "Local airport reposition",
          costUsd: 25,
        },
        {
          mode: "flight",
          label: `${origin} → ${repositionHub}`,
          detail: "Feeder · Economy",
          costUsd: 89,
        },
        {
          mode: "flight",
          label: `${repositionHub} → ${dest}`,
          detail: "Partner business · 70k miles + $5.60",
          costUsd: 5.6,
          milesUsed: 70_000,
          cpp: 2.1,
        },
        hotelSegment,
      ],
      scores: {
        tvs: 94,
        trueOutOfPocket: 892,
        frictionMinutes: 120,
        comfortScore: 88,
        valueScore: 96,
        statusScore: 82,
        confidence: 0.91,
      },
      instrumentsUsed: [],
      preCrimeWarnings: [`45-min ${origin} connection buffer recommended if same-day reposition.`],
      departureAirports: [origin, repositionHub],
      recommended: false,
    });
  } else {
    const feeder = altOrigins[0] ?? origin;
    strategies.push({
      id: "reposition_award",
      kind: "reposition_award",
      title: altOrigins.length > 0 ? "Alternate Airport Play" : "Connecting Play",
      headline:
        altOrigins.length > 0
          ? `${feeder} → ${dest} · compare nearby gateways`
          : `${origin} → ${dest} · 1-stop value routing`,
      reasoning:
        altOrigins.length > 0
          ? `Search ${[origin, ...altOrigins].join(", ")} for the lowest cash or miles out of your metro — not a US West Coast default.`
          : `Optimized connecting routing from ${origin} to ${dest}. Live Duffel pricing checks your stated origin, not LAX/ONT defaults.`,
      segments: [
        {
          mode: "flight",
          label: `${feeder} → ${dest}`,
          detail: altOrigins.length > 0 ? "Alternate gateway · award or cash" : "1-stop · award or cash",
          costUsd: 420,
          milesUsed: 55_000,
          cpp: 1.9,
        },
        hotelSegment,
      ],
      scores: {
        tvs: 88,
        trueOutOfPocket: 720,
        frictionMinutes: 75,
        comfortScore: 82,
        valueScore: 90,
        statusScore: 78,
        confidence: 0.86,
      },
      instrumentsUsed: [],
      preCrimeWarnings: [`Confirm award space ${feeder} → ${dest} before committing.`],
      departureAirports: [feeder],
      recommended: false,
    });
  }

  strategies.push(
    {
      id: "direct_cash",
      kind: "direct_cash",
      title: "Direct Play",
      headline: `${origin} → ${dest} · cash fare`,
      reasoning: `Simplest path: fly ${origin} → ${dest} in cash. No US repositioning assumed — Duffel live search uses your origin airports.`,
      segments: [
        {
          mode: "flight",
          label: `${origin} → ${dest}`,
          detail: "Best available nonstop or 1-stop · live Duffel",
          costUsd: 850,
        },
        {
          mode: "hotel",
          label: `${primaryHotel} ${destLabel}`,
          detail: "21k Hyatt points/night × trip length",
          costUsd: 0,
          milesUsed: 210_000,
          cpp: 1.7,
        },
      ],
      scores: {
        tvs: 81,
        trueOutOfPocket: 850,
        frictionMinutes: 20,
        comfortScore: 92,
        valueScore: 68,
        statusScore: 75,
        confidence: 0.95,
      },
      instrumentsUsed: [],
      preCrimeWarnings: [],
      departureAirports: [origin],
      recommended: false,
    },
    {
      id: "instrument_play",
      kind: "instrument_play",
      title: "Instrument Play",
      headline: `${origin} → ${dest} · certs + points`,
      reasoning: guestUpgrade
        ? `Use ${guestUpgrade.label} on ${origin}→${dest}. Burn suite cert at ${primaryHotel} ${destLabel} when face value is highest.`
        : `Combine upgrade instruments and hotel points for ${origin} → ${dest}.`,
      segments: [
        {
          mode: "flight",
          label: `${origin} → ${dest}`,
          detail: "Upgrade instrument or miles · business when available",
          costUsd: 420,
          milesUsed: 15_000,
          cpp: 1.9,
        },
        {
          mode: "hotel",
          label: `${primaryHotel} ${destLabel}`,
          detail: "Suite cert + points top-up nights",
          costUsd: 180,
          milesUsed: 35_000,
          cpp: 1.7,
        },
      ],
      scores: {
        tvs: 78,
        trueOutOfPocket: 600,
        frictionMinutes: 60,
        comfortScore: 95,
        valueScore: 72,
        statusScore: 90,
        confidence: 0.84,
      },
      instrumentsUsed: [
        {
          instrumentId: guestUpgrade?.id ?? "guest-upgrade",
          label: guestUpgrade?.label ?? "Guest Upgrade Certificate",
          valueUsd: guestUpgrade?.estimatedValueUsd ?? 450,
          optimal: true,
        },
        {
          instrumentId: suiteCert?.id ?? "suite-cert",
          label: suiteCert?.label ?? "Globalist Suite Certificate",
          valueUsd: suiteCert?.estimatedValueUsd ?? 800,
          optimal: true,
        },
      ],
      preCrimeWarnings: [
        suiteCert?.expiresAt
          ? `Suite cert expires ${suiteCert.expiresAt} — verify before booking.`
          : "Verify suite cert expiry before booking.",
        "Upgrade inventory limited — confirm before committing.",
      ],
      departureAirports: [origin],
      recommended: false,
    },
    {
      id: "status_play",
      kind: "status_play",
      title: "Status Play",
      headline: `${origin} → ${dest} · earn requal · lounges`,
      reasoning: `Pay cash for flexible fare from ${origin} to maximize status credit and lounge access. Hotel on points — preserve suite cert.`,
      segments: [
        {
          mode: "flight",
          label: `${origin} → ${dest}`,
          detail: "Full fare economy+ · status earn",
          costUsd: 1100,
        },
        {
          mode: "hotel",
          label: `${primaryHotel} ${destLabel}`,
          detail: "Points only · preserve suite cert",
          costUsd: 0,
          milesUsed: 210_000,
          cpp: 1.7,
        },
      ],
      scores: {
        tvs: 74,
        trueOutOfPocket: 1100,
        frictionMinutes: 30,
        comfortScore: 85,
        valueScore: 62,
        statusScore: 98,
        confidence: 0.88,
      },
      instrumentsUsed: [
        {
          instrumentId: suiteCert?.id ?? "suite-cert",
          label: "Suite cert preserved",
          valueUsd: 0,
          optimal: false,
          warning: "Not used — saved for higher-value property",
        },
      ],
      preCrimeWarnings: ["Higher cash outlay — best when status requal matters this year."],
      departureAirports: [origin],
      recommended: false,
    },
  );

  if (!genome.toleratesRepositioning) {
    for (const s of strategies) {
      if (s.kind === "reposition_award") {
        s.scores.tvs -= 15;
        s.recommended = false;
        s.preCrimeWarnings.push("Genome marks repositioning as undesirable — score penalized.");
      }
    }
  }

  if (genome.prefersNonstop) {
    for (const s of strategies) {
      if (s.kind === "direct_cash") s.scores.tvs += 8;
      if (s.kind === "reposition_award") s.scores.tvs -= 5;
    }
  }

  return strategies;
}

function buildItalyStrategies(intent: TripIntent, genome: TravelerGenome): TravelStrategy[] {
  return buildRouteStrategies(intent, genome);
}

function buildGenericStrategies(
  intent: TripIntent,
  genome: TravelerGenome,
  planMode: PlanMode = "full",
): TravelStrategy[] {
  let strategies = buildItalyStrategies(
    { ...intent, destination: intent.destination, destinationIata: intent.destinationIata },
    genome,
  );
  strategies = personalizeStrategiesForIntent(strategies, intent, genome);
  if (planMode === "flights") {
    const homeIata = resolvePrimaryOrigin(intent, genome);
    if (homeIata) {
      strategies = toFlightOnlyStrategies(strategies, intent, homeIata);
    }
  }
  return strategies;
}

function instrumentHighlights(genome: TravelerGenome): string[] {
  const lines: string[] = [];
  for (const inst of genome.instruments) {
    const expiry = inst.expiresAt
      ? ` · expires ${inst.expiresAt}`
      : "";
    lines.push(`${inst.quantity}× ${inst.label}${expiry} (~$${inst.estimatedValueUsd} value)`);
  }
  for (const pts of genome.pointsBalances.slice(0, 2)) {
    lines.push(`${pts.balance.toLocaleString()} ${pts.program} · baseline ${pts.baselineCpp}¢/pt`);
  }
  return lines;
}

export interface BuildDecisionOptions {
  comfortWeight?: number;
  mutation?: CounterfactualMutation;
  planMode?: PlanMode;
  paymentMode?: PaymentMode;
  enabledLegIds?: string[];
}

export function buildDecisionBrief(
  rawPrompt: string,
  genome: TravelerGenome,
  options: BuildDecisionOptions = {},
): DecisionBrief {
  let intent = parseTripIntent(rawPrompt);
  if (options.mutation?.dateShiftDays) {
    const start = new Date(intent.startDate);
    const end = new Date(intent.endDate);
    start.setDate(start.getDate() + options.mutation.dateShiftDays);
    end.setDate(end.getDate() + options.mutation.dateShiftDays);
    intent = {
      ...intent,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  const searchAirports = resolveSearchAirports(intent, genome);
  const needsOrigin = originRequiredForIntent(intent);

  const planMode = options.planMode ?? "full";
  let flightLegs = buildFlightLegsFromIntent(intent, genome);
  flightLegs = applyLegEnabledOverrides(flightLegs, options.enabledLegIds);
  flightLegs = annotateLegLoyaltyNotes(flightLegs, intent);

  if (needsOrigin) {
    return {
      intent,
      inferredSummary: `${intent.destination} — name your departure city or airport to see routes (no US West Coast default).`,
      searchAirports,
      strategies: [],
      originRequired: true,
      planMode,
      flightLegs,
      questions: [
        {
          id: "q-stated-origin",
          prompt: "Where are you flying from?",
          stakes: "Routes and live fares need your real departure airport — not a West Coast guess.",
          flipsRanking: true,
          options: [
            { id: "edit", label: "Add origin to your prompt (e.g. London Heathrow to Italy)" },
          ],
        },
      ],
      instrumentHighlights: instrumentHighlights(genome),
      genomeSnapshot: {
        homeRegion: genome.homeRegion,
        decisionWeights: genome.decisionWeights,
        hotelChainPriority: genome.hotelChainPriority,
        tripCount: genome.tripCount,
      },
    };
  }

  let strategies = buildGenericStrategies(intent, genome, planMode);

  if (options.mutation?.willingToReposition !== undefined) {
    const g = { ...genome, toleratesRepositioning: options.mutation.willingToReposition };
    strategies = buildGenericStrategies(intent, g, planMode);
  }

  const comfortWeight =
    options.mutation?.priorityComfort ??
    options.comfortWeight ??
    genome.decisionWeights.comfort;

  strategies = rankStrategiesByValue(strategies, genome, comfortWeight);
  const strategyCatalog = strategies;
  const paymentMode = options.paymentMode ?? "cash";
  const visibleStrategies =
    planMode === "flights"
      ? filterStrategiesByPaymentMode(strategyCatalog, paymentMode)
      : strategyCatalog;

  const questions = buildQuestionBudget(visibleStrategies, genome, intent);

  return {
    intent,
    inferredSummary: buildInferredSummary(intent, searchAirports),
    searchAirports,
    strategies: visibleStrategies,
    strategyCatalog,
    paymentMode,
    questions,
    instrumentHighlights: instrumentHighlights(genome),
    planMode,
    flightLegs,
    genomeSnapshot: {
      homeRegion: genome.homeRegion,
      decisionWeights: genome.decisionWeights,
      hotelChainPriority: genome.hotelChainPriority,
      tripCount: genome.tripCount,
    },
  };
}

export function buildCounterfactual(
  rawPrompt: string,
  genome: TravelerGenome,
  mutation: CounterfactualMutation,
): CounterfactualResult {
  const baseline = buildDecisionBrief(rawPrompt, genome);
  const mutated = buildDecisionBrief(rawPrompt, genome, { mutation });

  const originalTop = baseline.strategies[0];
  const newTop = mutated.strategies[0];
  if (!originalTop || !newTop) {
    return {
      originalTopId: "",
      newTopId: "",
      rankingChanged: false,
      deltas: [],
    };
  }

  const deltas = mutated.strategies.map((s) => {
    const prev = baseline.strategies.find((b) => b.kind === s.kind);
    const tvsDelta = prev ? s.scores.tvs - prev.scores.tvs : 0;
    return {
      strategyId: s.id,
      title: s.title,
      tvsDelta,
      summary:
        tvsDelta > 0
          ? `+${tvsDelta} TVS vs baseline`
          : tvsDelta < 0
            ? `${tvsDelta} TVS vs baseline`
            : "Unchanged",
    };
  });

  return {
    originalTopId: originalTop.id,
    newTopId: newTop.id,
    rankingChanged: originalTop.id !== newTop.id,
    deltas,
  };
}
