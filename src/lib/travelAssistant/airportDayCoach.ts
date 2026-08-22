/**
 * Pure helpers for Universal Airport Day Coach (AirportNavigatorFallback).
 * Mode derivation: journeyPhase.just-landed -> arrive; otherwise depart.
 */

import { resolveAirport } from "@/lib/airports/lookup";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import type { AirportLocationPhase } from "@/lib/travelAssistant/airportLocationPhase";
import { departPhaseHomeTitle } from "@/lib/travelAssistant/airportLocationPhase";
import type { HomeNextAction } from "@/lib/travelAssistant/homeNextAction";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import type {
  ConnectionPlaybook,
  ConnectionPlaybookStep,
} from "@/lib/travelAssistant/connectionPlaybook";
import { connectionRiskLabel } from "@/lib/travelAssistant/connectionPlaybook";

export type AirportDayCoachMode = "depart" | "arrive";

export type DayCoachPathStep = {
  id: string;
  icon: string;
  text: string;
  detail?: string;
  minutes?: number;
};

/** Jeff-approved: journeyPhase just-landed is the sole trigger (not live status alone). */
export function deriveAirportDayCoachMode(
  phase: Pick<JourneyPhase, "kind"> | null | undefined,
): AirportDayCoachMode {
  return phase?.kind === "just-landed" ? "arrive" : "depart";
}

/** True when dep/arr countries differ; unknown codes -> treat as international (safer checklist). */
export function isInternationalArrivalFlight(
  departureIata: string | null | undefined,
  arrivalIata: string | null | undefined,
): boolean {
  const dep = resolveAirport((departureIata ?? "").trim());
  const arr = resolveAirport((arrivalIata ?? "").trim());
  if (!dep?.country || !arr?.country) return true;
  return dep.country.toUpperCase() !== arr.country.toUpperCase();
}

/** Time-budget reassurance under the departure header. Null under 45m (amber countdown owns urgency). */
export function departureTimeBudgetReassurance(minutesToDeparture: number): string | null {
  const minutes = Math.round(minutesToDeparture);
  if (minutes >= 90) return `${minutes}m until departure · plenty of time`;
  if (minutes >= 45) return `${minutes}m until departure · you're on track`;
  return null;
}

/**
 * Coach view shows current + next step; full-day shows all.
 * currentIndex advances from booked/observed facts (G46), not manual checkboxes.
 */
export function selectDayCoachVisibleSteps<T>(
  steps: readonly T[],
  fullDayView: boolean,
  currentIndex = 0,
): { visible: T[]; hiddenCount: number; currentIndex: number } {
  const maxIdx = Math.max(0, steps.length - 1);
  const idx = Math.min(Math.max(0, currentIndex), maxIdx);
  if (fullDayView || steps.length <= 2) {
    return { visible: [...steps], hiddenCount: 0, currentIndex: idx };
  }
  const visible = steps.slice(idx, idx + 2) as T[];
  const hiddenCount = Math.max(0, steps.length - (idx + visible.length));
  return { visible, hiddenCount, currentIndex: idx };
}

/** Fact-driven arrival spotlight — never invents carousel or indoor position. */
export function resolveArrivalSpotlightIndex(input: {
  steps: readonly DayCoachPathStep[];
  landedMinutesAgo?: number | null;
  locationStatus?: string;
  hasLiveBaggage?: boolean;
}): number {
  if (input.steps.length === 0) return 0;
  const idx = (id: string) => input.steps.findIndex((s) => s.id === id);
  const landed = input.landedMinutesAgo ?? 0;
  const atAirport =
    input.locationStatus === "at-airport" || input.locationStatus === "in-terminal";

  const rideIdx = idx("ride");
  if (rideIdx >= 0 && atAirport && landed >= 25) return rideIdx;

  const postBagsIdx = idx("customs") >= 0 ? idx("customs") : idx("exit");
  if (postBagsIdx >= 0 && landed >= 15 && atAirport) return postBagsIdx;

  const bagsIdx = idx("bags");
  if (bagsIdx >= 0 && (input.hasLiveBaggage || (atAirport && landed >= 5))) return bagsIdx;

  const immIdx = idx("immigration");
  if (immIdx >= 0 && landed >= 3) return immIdx;

  return 0;
}

/** Depart spotlight from LocationPhase + tagged guide steps (unifies AirportMode). */
export function resolveDepartSpotlightIndex(
  steps: readonly DayCoachPathStep[],
  phase: AirportLocationPhase,
): number {
  if (steps.length === 0) return 0;
  const find = (id: string) => steps.findIndex((s) => s.id === id);

  switch (phase) {
    case "head-to-gate":
    case "at-gate":
    case "final-call": {
      const gate = find("gate");
      return gate >= 0 ? gate : steps.length - 1;
    }
    case "lounge": {
      const lounge = steps.findIndex((s) => /lounge/i.test(s.text));
      return lounge >= 0 ? lounge : find("security") >= 0 ? find("security") : 1;
    }
    case "security":
      return find("security") >= 0 ? find("security") : 1;
    case "check-in":
      return find("check-in") >= 0 ? find("check-in") : 0;
    case "leave-soon":
    case "leave-now":
    case "off":
    default:
      return 0;
  }
}

/** Tag gate-instruction steps with stable ids for spotlight mapping. */
export function tagDepartGuideSteps(
  guideSteps: readonly { icon: string; text: string; detail?: string; minutes: number }[],
): DayCoachPathStep[] {
  return guideSteps.map((step, index) => {
    let id = `guide-${index}`;
    if (index === 0) id = "security";
    else if (/gate/i.test(step.text)) id = "gate";
    else if (/lounge/i.test(step.text)) id = "lounge";
    return {
      id,
      icon: step.icon,
      text: step.text,
      detail: step.detail,
      minutes: step.minutes > 0 ? step.minutes : undefined,
    };
  });
}

export interface AirportHomeSpotlightInput {
  mode: AirportDayCoachMode;
  steps: readonly DayCoachPathStep[];
  currentIndex: number;
  locationPhase?: AirportLocationPhase;
  gateCode?: string | null;
  minutesToDeparture?: number | null;
  hotelLabel?: string | null;
  connectionPlaybook?: ConnectionPlaybook | null;
  connectionStep?: ConnectionPlaybookStep | null;
}

/** Specific Home / TripWalk line — replaces generic "Open Airport Mode" when known. */
export function buildAirportHomeSpotlight(input: AirportHomeSpotlightInput): HomeNextAction | null {
  if (input.connectionPlaybook && input.connectionStep) {
    const risk = connectionRiskLabel(input.connectionPlaybook.risk);
    return {
      kind: "airport",
      eyebrow: risk,
      title: input.connectionStep.text,
      detail:
        input.connectionPlaybook.issueLine ??
        input.connectionStep.detail ??
        `${input.connectionPlaybook.hubIata} connection`,
      ctaLabel: "Open connection guide",
    };
  }

  const step = input.steps[input.currentIndex] ?? input.steps[0] ?? null;

  if (input.mode === "arrive" && step) {
    if (step.id === "ride" && input.hotelLabel?.trim()) {
      return {
        kind: "airport",
        eyebrow: "Just landed",
        title: `Ride to ${input.hotelLabel.trim()}`,
        detail: step.detail ?? "Open Uber or your booked transfer once you are landside.",
        ctaLabel: "Open Airport Mode",
      };
    }
    return {
      kind: "airport",
      eyebrow: "Just landed",
      title: step.text,
      detail: step.detail,
      ctaLabel: "Open Airport Mode",
    };
  }

  if (input.mode === "depart") {
    const phaseTitle = input.locationPhase ? departPhaseHomeTitle(input.locationPhase) : null;
    if (phaseTitle) {
      const gate = input.gateCode?.trim();
      return {
        kind: "airport",
        eyebrow: "Next up",
        title: phaseTitle,
        detail: gate ? `Gate ${gate.toUpperCase()}` : undefined,
        ctaLabel: "Open Airport Mode",
      };
    }
    if (step) {
      const gate = input.gateCode?.trim();
      const mins = input.minutesToDeparture;
      const timeSuffix =
        mins != null && mins > 0 ? ` · ${Math.round(mins)}m to departure` : "";
      const detailParts = [step.detail, gate ? `Gate ${gate.toUpperCase()}${timeSuffix}` : timeSuffix.trim()]
        .filter(Boolean)
        .join("");
      return {
        kind: "airport",
        eyebrow: "Next up",
        title: step.text,
        detail: detailParts || undefined,
        ctaLabel: "Open Airport Mode",
      };
    }
  }

  return null;
}


/** Format a live FA/ADB baggage claim for the arrival coach. Null if empty/untrusted. */
export function formatLiveBaggageCarouselNote(raw: string | null | undefined): string | null {
  const claim = (raw ?? "").trim();
  if (!claim || claim.length > 24) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9\s\-/#.]{0,22}$/u.test(claim)) return null;
  if (/carousel|belt|claim/i.test(claim)) {
    return `${claim} — from live flight status`;
  }
  return `Carousel ${claim} — from live flight status`;
}

export interface ArrivalDayCoachInput {
  iata: string;
  flightNumber?: string | null;
  airlineName?: string | null;
  departureIata?: string | null;
  arrivalTerminal?: string | null;
  hotelLabel?: string | null;
  baggageCarouselNote?: string | null;
  baggageWalkMinutes?: number | null;
}

/** Arrival path matching approved mockup (intl steps only when countries differ). */
export function buildArrivalDayCoachPath(input: ArrivalDayCoachInput): DayCoachPathStep[] {
  const code = input.iata.trim().toUpperCase();
  const intl = isInternationalArrivalFlight(input.departureIata, code);
  const flightLabel = input.flightNumber?.trim() || "your flight";
  const nav = getAirportNav(code);
  const curated =
    input.baggageCarouselNote?.trim() ||
    nav?.arrivalInfo?.baggageCarousels?.[0]?.carouselNote ||
    null;
  const walk =
    input.baggageWalkMinutes ?? nav?.arrivalInfo?.baggageCarousels?.[0]?.walkMinutes ?? undefined;

  const steps: DayCoachPathStep[] = [
    {
      id: "deplane",
      icon: "🛬",
      text: "Leave aircraft → Arrivals",
      detail: "Follow Arrivals signs — stay inside until baggage claim",
    },
  ];

  if (intl) {
    steps.push({
      id: "immigration",
      icon: "🛂",
      text: "Immigration / passport control",
      detail: "Have passport ready. Use Global Entry / Mobile Passport if enrolled.",
    });
  }

  steps.push({
    id: "bags",
    icon: "🧳",
    text: `Bags — claim for ${flightLabel}`,
    detail: curated || "Carousel number is on the airport screens — Kepi does not invent belt numbers.",
    minutes: walk && walk > 0 ? walk : undefined,
  });

  if (intl) {
    steps.push({
      id: "customs",
      icon: "📄",
      text: "Customs → Exit",
      detail: nav?.arrivalInfo?.customsTip || "Declare food/agriculture as required, then follow Exit / Ground Transport signs.",
    });
  } else {
    steps.push({
      id: "exit",
      icon: "🚪",
      text: "Exit to ground transport",
      detail: nav?.arrivalInfo?.exitDirections || "Follow Exit / Ground Transport signs to the arrivals curb.",
    });
  }

  const hotel = input.hotelLabel?.trim();
  steps.push({
    id: "ride",
    icon: "🚕",
    text: hotel ? `Ride / hotel — ${hotel}` : "Ride / hotel",
    detail: "Open Uber or your booked transfer once you are landside.",
  });

  return steps;
}

/** Known airline → terminal hints when booking lacks terminal (curated, honest). */
const AIRLINE_TERMINAL_HINTS: Record<string, Record<string, string>> = {
  ONT: { AS: "2", Alaska: "2" },
};

function inferTerminalHint(iata: string, airlineName: string): string | null {
  const code = iata.trim().toUpperCase();
  const airline = airlineName.trim();
  if (!code || !airline) return null;
  const byAirport = AIRLINE_TERMINAL_HINTS[code];
  if (!byAirport) return null;
  const upper = airline.toUpperCase();
  for (const [key, terminal] of Object.entries(byAirport)) {
    if (upper.includes(key.toUpperCase())) return terminal;
  }
  return null;
}

/** Departure coach first step — airline + terminal when known (M39). */
export function buildDepartCheckInCoachStep(input: {
  iata: string;
  airlineName?: string | null;
  flightNumber?: string | null;
  departureTerminal?: string | null;
}): DayCoachPathStep {
  const airline = input.airlineName?.trim() ?? "";
  const terminal =
    input.departureTerminal?.trim() ||
    inferTerminalHint(input.iata, airline) ||
    null;
  const flight = input.flightNumber?.trim() ?? "";
  const headParts = [airline || null, terminal ? `Terminal ${terminal}` : null].filter(Boolean);
  const text = headParts.length > 0 ? `${headParts.join(" · ")} · check-in` : "Check in";
  return {
    id: "check-in",
    icon: "🧳",
    text,
    detail: flight
      ? `${flight} — airline app, kiosk, or counter`
      : "Airline app, kiosk, or counter · drop bags if needed",
  };
}
