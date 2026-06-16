import { buildInferredSummary, parseTripIntent } from "@/lib/decision/intentParser";
import { buildQuestionBudget } from "@/lib/decision/questionBudget";
import { rankStrategiesByValue } from "@/lib/decision/strategyRanking";
import { personalizeStrategiesForIntent } from "@/lib/decision/strategyPersonalization";
import type {
  CounterfactualMutation,
  CounterfactualResult,
  DecisionBrief,
  TravelStrategy,
  TripIntent,
} from "@/lib/decision/types";
import type { TravelerGenome } from "@/lib/traveler/types";

function expandSearchAirports(genome: TravelerGenome, intent?: TripIntent): string[] {
  const fromIntent = intent?.originAirports ?? [];
  const fromCluster = genome.geoCluster.map((a) => a.iata);
  const gateways = ["SEA", "SFO"];
  return [...new Set([...fromIntent, ...fromCluster, ...gateways])].slice(0, 6);
}

function buildItalyStrategies(intent: TripIntent, genome: TravelerGenome): TravelStrategy[] {
  const suiteCert = genome.instruments.find((i) => i.type === "suite_certificate");
  const guestUpgrade = genome.instruments.find((i) => i.type === "guest_upgrade");
  const primaryHotel = genome.hotelChainPriority[0] ?? "Hyatt";

  const strategies: TravelStrategy[] = [
    {
      id: "reposition_award",
      kind: "reposition_award",
      title: "Reposition Play",
      headline: "ONT → SEA · Alaska partner J to Rome",
      reasoning:
        "Drive to Ontario, reposition to Seattle for Alaska partner business class at 70k miles. Beats LAX cash by ~$1,400 at 2.1¢/mi. MVP Gold lounge at SEA before departure.",
      segments: [
        {
          mode: "drive",
          label: "Drive to ONT",
          detail: "~35 min from home cluster",
          costUsd: 25,
        },
        {
          mode: "flight",
          label: "ONT → SEA",
          detail: "Alaska AS 543 · Economy",
          costUsd: 89,
        },
        {
          mode: "flight",
          label: "SEA → FCO",
          detail: "Partner business · 70k AS miles + $5.60",
          costUsd: 5.6,
          milesUsed: 70_000,
          cpp: 2.1,
        },
        {
          mode: "hotel",
          label: `${primaryHotel} Centric Rome`,
          detail: "21k Hyatt points/night · Globalist breakfast + late checkout",
          costUsd: 0,
          milesUsed: 21_000,
          cpp: 1.7,
        },
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
      preCrimeWarnings: ["45-min ONT connection buffer recommended if same-day reposition."],
      departureAirports: ["ONT", "SEA"],
      recommended: false,
    },
    {
      id: "direct_cash",
      kind: "direct_cash",
      title: "Direct Play",
      headline: "LAX → FCO nonstop · cash fare",
      reasoning:
        "Simplest path: nonstop from LAX in premium economy cash, Hyatt on points. No repositioning, no certificates burned. Best when time matters more than marginal savings.",
      segments: [
        {
          mode: "flight",
          label: "LAX → FCO",
          detail: "Nonstop premium economy · ~$1,850 RT",
          costUsd: 1850,
        },
        {
          mode: "hotel",
          label: `${primaryHotel} Centric Rome`,
          detail: "21k Hyatt points/night × 10 nights",
          costUsd: 0,
          milesUsed: 210_000,
          cpp: 1.7,
        },
      ],
      scores: {
        tvs: 81,
        trueOutOfPocket: 1850,
        frictionMinutes: 20,
        comfortScore: 92,
        valueScore: 68,
        statusScore: 75,
        confidence: 0.95,
      },
      instrumentsUsed: [],
      preCrimeWarnings: [],
      departureAirports: ["LAX"],
      recommended: false,
    },
    {
      id: "instrument_play",
      kind: "instrument_play",
      title: "Instrument Play",
      headline: "SNA → FCO · guest upgrade cert + suite cert",
      reasoning:
        guestUpgrade
          ? `Use your ${guestUpgrade.label} for business on SNA→SEA→FCO. Burn Globalist suite cert at Park Hyatt Roma for maximum cert value (~$800/night suite for cert face value).`
          : "Combine upgrade instrument with Globalist suite certificate at Park Hyatt Roma.",
      segments: [
        {
          mode: "flight",
          label: "SNA → FCO",
          detail: "1-stop via SEA · cert upgrade to business",
          costUsd: 420,
          milesUsed: 15_000,
          cpp: 1.9,
        },
        {
          mode: "hotel",
          label: "Park Hyatt Roma",
          detail: "Suite cert + points top-up nights",
          costUsd: 180,
          milesUsed: 35_000,
          cpp: 1.7,
        },
      ],
      scores: {
        tvs: 78,
        trueOutOfPocket: 600,
        frictionMinutes: 90,
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
          ? `Suite cert expires ${suiteCert.expiresAt} — this trip uses it optimally.`
          : "Verify suite cert expiry before booking.",
        "Guest upgrade inventory limited — confirm before committing.",
      ],
      departureAirports: ["SNA", "SEA"],
      recommended: false,
    },
    {
      id: "status_play",
      kind: "status_play",
      title: "Status Play",
      headline: "LAX → FCO · earn requal · lounge chain",
      reasoning:
        "Pay cash for flexible fare on Oneworld metal to maximize Alaska status credit. Use MVP Gold lounge access at LAX T6 and partner lounges in Rome. Hyatt base room on points — save suite cert.",
      segments: [
        {
          mode: "flight",
          label: "LAX → FCO",
          detail: "AA/BA codeshare · full fare economy+ · ~$2,100",
          costUsd: 2100,
        },
        {
          mode: "hotel",
          label: `${primaryHotel} Centric Rome`,
          detail: "Points only · preserve suite cert",
          costUsd: 0,
          milesUsed: 210_000,
          cpp: 1.7,
        },
      ],
      scores: {
        tvs: 74,
        trueOutOfPocket: 2100,
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
      preCrimeWarnings: ["Higher cash outlay — best if requalifying MVP Gold 75K this year."],
      departureAirports: ["LAX"],
      recommended: false,
    },
  ];

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

function buildGenericStrategies(intent: TripIntent, genome: TravelerGenome): TravelStrategy[] {
  let strategies = buildItalyStrategies(
    { ...intent, destination: intent.destination, destinationIata: intent.destinationIata },
    genome,
  );
  strategies = personalizeStrategiesForIntent(strategies, intent, genome);
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

  const searchAirports = expandSearchAirports(genome, intent);
  let strategies = buildGenericStrategies(intent, genome);

  if (options.mutation?.willingToReposition !== undefined) {
    const g = { ...genome, toleratesRepositioning: options.mutation.willingToReposition };
    strategies = buildGenericStrategies(intent, g);
  }

  const comfortWeight =
    options.mutation?.priorityComfort ??
    options.comfortWeight ??
    genome.decisionWeights.comfort;

  strategies = rankStrategiesByValue(strategies, genome, comfortWeight);

  const questions = buildQuestionBudget(strategies, genome);

  return {
    intent,
    inferredSummary: buildInferredSummary(intent, searchAirports),
    searchAirports,
    strategies,
    questions,
    instrumentHighlights: instrumentHighlights(genome),
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
