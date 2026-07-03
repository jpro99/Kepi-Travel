import type { TravelStyleMode, TravelStyleProfile, TravelStyleScores } from "@/lib/traveler/types";

export type { TravelStyleMode, TravelStyleProfile, TravelStyleScores };

export interface TravelStyleQuestion {
  id: string;
  prompt: string;
  options: Array<{ mode: TravelStyleMode; label: string }>;
}

/** Ten quick travel-behavior questions (one tap each). */
export const TRAVEL_STYLE_QUESTIONS: TravelStyleQuestion[] = [
  {
    id: "airport",
    prompt: "At the airport, you mostly want…",
    options: [
      { mode: "quick_board", label: "Gate and go — keep it short" },
      { mode: "route_scout", label: "Times, connections, and why" },
      { mode: "travel_companion", label: "Calm updates — you've got this" },
      { mode: "flight_plan", label: "A clear step-by-step list" },
    ],
  },
  {
    id: "flight_pick",
    prompt: "Choosing a flight, you usually…",
    options: [
      { mode: "quick_board", label: "Grab the first good option" },
      { mode: "route_scout", label: "Compare routes and value" },
      { mode: "travel_companion", label: "Pick what feels least stressful" },
      { mode: "flight_plan", label: "Fit the schedule into the plan" },
    ],
  },
  {
    id: "hotel",
    prompt: "Booking a hotel, you prefer to…",
    options: [
      { mode: "quick_board", label: "Book fast and move on" },
      { mode: "route_scout", label: "Weigh perks, points, and price" },
      { mode: "travel_companion", label: "Choose a place that feels right" },
      { mode: "flight_plan", label: "Lock dates into the itinerary" },
    ],
  },
  {
    id: "change",
    prompt: "When plans change, you want…",
    options: [
      { mode: "quick_board", label: "One clear fix — now" },
      { mode: "route_scout", label: "Ranked options with tradeoffs" },
      { mode: "travel_companion", label: "Reassurance while we adjust" },
      { mode: "flight_plan", label: "An updated checklist" },
    ],
  },
  {
    id: "points",
    prompt: "Points and miles are…",
    options: [
      { mode: "quick_board", label: "Nice — don't slow me down" },
      { mode: "route_scout", label: "Worth optimizing each trip" },
      { mode: "travel_companion", label: "A bonus if it's easy" },
      { mode: "flight_plan", label: "Part of the travel plan" },
    ],
  },
  {
    id: "app",
    prompt: "During a trip, the best Kepi screen shows…",
    options: [
      { mode: "quick_board", label: "What's next — one tap" },
      { mode: "route_scout", label: "Connections, timing, and why" },
      { mode: "travel_companion", label: "A calm check-in that you're on track" },
      { mode: "flight_plan", label: "Today's list, checked off as you go" },
    ],
  },
  {
    id: "planning",
    prompt: "Planning a trip feels like…",
    options: [
      { mode: "quick_board", label: "Let's go already" },
      { mode: "route_scout", label: "A puzzle to solve" },
      { mode: "travel_companion", label: "An adventure to savor" },
      { mode: "flight_plan", label: "A project to organize" },
    ],
  },
  {
    id: "alerts",
    prompt: "Travel alerts should be…",
    options: [
      { mode: "quick_board", label: "Short and actionable" },
      { mode: "route_scout", label: "Detailed with context" },
      { mode: "travel_companion", label: "Supportive and human" },
      { mode: "flight_plan", label: "Structured by priority" },
    ],
  },
  {
    id: "landing",
    prompt: "After you land, you like…",
    options: [
      { mode: "quick_board", label: "Done — next thing" },
      { mode: "route_scout", label: "What worked / what didn't" },
      { mode: "travel_companion", label: "A moment to celebrate" },
      { mode: "flight_plan", label: "Log it against the plan" },
    ],
  },
  {
    id: "packing",
    prompt: "Packing and prep are…",
    options: [
      { mode: "quick_board", label: "Minimal — don't overthink" },
      { mode: "route_scout", label: "Optional detail" },
      { mode: "travel_companion", label: "Easier with encouragement" },
      { mode: "flight_plan", label: "Checklists all the way" },
    ],
  },
];

export const TRAVEL_GUIDANCE_MODES: TravelStyleMode[] = [
  "quick_board",
  "route_scout",
  "travel_companion",
  "flight_plan",
];

/** Travel-themed guidance labels shown in settings and badges. */
export const TRAVEL_STYLE_LABELS: Record<
  TravelStyleMode,
  { title: string; guidanceLabel: string; tagline: string; emoji: string }
> = {
  quick_board: {
    title: "Quick Board",
    guidanceLabel: "Fast guidance",
    tagline: "Short nudges — gate, go, minimal friction",
    emoji: "⚡",
  },
  route_scout: {
    title: "Route Scout",
    guidanceLabel: "Smart guidance",
    tagline: "Compare options, tradeoffs, and the why",
    emoji: "🧭",
  },
  travel_companion: {
    title: "Travel Companion",
    guidanceLabel: "Calm guidance",
    tagline: "Steady encouragement — you've got this",
    emoji: "🤝",
  },
  flight_plan: {
    title: "Flight Plan",
    guidanceLabel: "Structured guidance",
    tagline: "Checklists, steps, and clear priorities",
    emoji: "📋",
  },
};

export function scoreTravelStyleAnswers(answers: TravelStyleMode[]): TravelStyleProfile {
  const counts: TravelStyleScores = {
    quick_board: 0,
    route_scout: 0,
    travel_companion: 0,
    flight_plan: 0,
  };
  for (const mode of answers) {
    counts[mode] += 1;
  }
  const total = answers.length || 1;
  const scores: TravelStyleScores = {
    quick_board: counts.quick_board / total,
    route_scout: counts.route_scout / total,
    travel_companion: counts.travel_companion / total,
    flight_plan: counts.flight_plan / total,
  };
  const dominant = dominantFromScores(scores);

  return {
    completed: true,
    scores,
    dominant,
    completedAt: new Date().toISOString(),
  };
}

export function dominantFromScores(scores: TravelStyleScores): TravelStyleMode {
  return (Object.entries(scores) as Array<[TravelStyleMode, number]>).sort((a, b) => b[1] - a[1])[0]![0];
}

/** Quiz scores, or Pro slider mix when the user has customized. */
export function effectiveStyleScores(profile: TravelStyleProfile | null | undefined): TravelStyleScores | null {
  if (!profile || profile.skipped || !profile.completed) return null;
  if (profile.mixCustomized && profile.guidanceMix) return profile.guidanceMix;
  return profile.scores;
}

export function effectiveDominantMode(profile: TravelStyleProfile | null | undefined): TravelStyleMode | null {
  const scores = effectiveStyleScores(profile);
  if (!scores) return null;
  return dominantFromScores(scores);
}

export function normalizeGuidanceMix(raw: TravelStyleScores): TravelStyleScores {
  const total =
    raw.quick_board + raw.route_scout + raw.travel_companion + raw.flight_plan || 1;
  return {
    quick_board: raw.quick_board / total,
    route_scout: raw.route_scout / total,
    travel_companion: raw.travel_companion / total,
    flight_plan: raw.flight_plan / total,
  };
}

export function applyGuidanceMix(
  profile: TravelStyleProfile,
  mix: TravelStyleScores,
): TravelStyleProfile {
  const normalized = normalizeGuidanceMix(mix);
  return {
    ...profile,
    guidanceMix: normalized,
    mixCustomized: true,
    dominant: dominantFromScores(normalized),
  };
}

export function clearGuidanceMix(profile: TravelStyleProfile): TravelStyleProfile {
  const { guidanceMix: _g, mixCustomized: _m, ...rest } = profile;
  return { ...rest, dominant: dominantFromScores(profile.scores) };
}

/** Maps travel style to app nudge density (toast / alert frequency). */
export function guidanceToneFromStyle(
  profile: TravelStyleProfile | null | undefined,
): "subtle" | "standard" {
  const scores = effectiveStyleScores(profile);
  if (!scores) return "standard";
  if (scores.quick_board >= 0.35 && scores.quick_board >= scores.route_scout) return "subtle";
  return "standard";
}

export function createSkippedTravelStyle(): TravelStyleProfile {
  return {
    completed: false,
    skipped: true,
    scores: { quick_board: 0.25, route_scout: 0.25, travel_companion: 0.25, flight_plan: 0.25 },
    dominant: "quick_board",
  };
}

export interface TravelStyleUX {
  detailLevel: "minimal" | "standard" | "rich";
  showEncouragement: boolean;
  preferChecklists: boolean;
}

export function travelStyleUX(profile: TravelStyleProfile | null | undefined): TravelStyleUX {
  if (!profile || profile.skipped || !profile.completed) {
    return { detailLevel: "standard", showEncouragement: false, preferChecklists: false };
  }
  const d = effectiveDominantMode(profile) ?? profile.dominant;
  if (d === "quick_board") {
    return { detailLevel: "minimal", showEncouragement: false, preferChecklists: false };
  }
  if (d === "route_scout") {
    return { detailLevel: "rich", showEncouragement: false, preferChecklists: false };
  }
  if (d === "travel_companion") {
    return { detailLevel: "standard", showEncouragement: true, preferChecklists: false };
  }
  return { detailLevel: "standard", showEncouragement: false, preferChecklists: true };
}

export function encouragementLine(context: string): string {
  const lines: Record<string, string> = {
    airport: "Nice work — you're on track for your flight.",
    hotel: "Good call planning this stay — you're set.",
    trip: "You're doing great. Kepi learns more every trip you take.",
    default: "You've got this — one step at a time.",
  };
  return lines[context] ?? lines.default;
}
