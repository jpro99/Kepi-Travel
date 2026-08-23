/**
 * Pure helpers for Universal Airport Day Coach (AirportNavigatorFallback).
 * Mode derivation: journeyPhase.just-landed -> arrive; otherwise depart.
 */

import { resolveAirport } from "@/lib/airports/lookup";
import { getAirportLayout } from "@/lib/airportNav/getLayout";
import { computeRoute } from "@/lib/airportNav/pathfinder";
import {
  buildArrivalTripJourney,
  buildTripJourney,
  layoutSupportsArrivalFirstMile,
  type ArrivalJourneyRole,
  type JourneyRole,
} from "@/lib/airportNav/tripJourney";
import { buildGateInstructions, getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import { resolveArrivalTransportPresentation } from "@/lib/travelAssistant/arrivalTransportPresentation";
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
export function resolveArrivalRideStep(input: {
  iata: string;
  hotelLabel?: string | null;
  flightArrivalTime?: string | null;
  flightTimezone?: string | null;
  landedMinutesAgo?: number | null;
  nowMs?: number;
  arrivalInfo?: {
    groundTransport?: string;
    rideStepTitle?: string;
    rideStepIcon?: string;
  } | null;
}): Pick<DayCoachPathStep, "id" | "icon" | "text" | "detail"> {
  const presentation = resolveArrivalTransportPresentation({
    iata: input.iata,
    flightArrivalTime: input.flightArrivalTime,
    flightTimezone: input.flightTimezone,
    landedMinutesAgo: input.landedMinutesAgo,
    hotelLabel: input.hotelLabel,
    nowMs: input.nowMs,
  });

  const hotel = input.hotelLabel?.trim();
  const info = input.arrivalInfo;
  const defaultDetail =
    presentation?.rideStepDetail ||
    info?.groundTransport ||
    "Open Uber or your booked transfer once you are landside.";
  const icon = presentation?.rideStepIcon || info?.rideStepIcon || "🚕";
  const baseTitle = presentation?.rideStepTitle || info?.rideStepTitle || (hotel ? `Ride / hotel — ${hotel}` : "Ride / hotel");
  const text =
    hotel && info?.rideStepTitle && !presentation?.rideStepTitle
      ? `${info.rideStepTitle}${hotel ? ` · then ${hotel}` : ""}`
      : baseTitle;
  return {
    id: "ride",
    icon,
    text,
    detail: defaultDetail,
  };
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
    if (step.id === "ride" && input.hotelLabel?.trim() && !/leonardo|train|express/i.test(step.text)) {
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
  arrivalGate?: string | null;
  hotelLabel?: string | null;
  baggageCarouselNote?: string | null;
  baggageWalkMinutes?: number | null;
  flightArrivalTime?: string | null;
  flightTimezone?: string | null;
  landedMinutesAgo?: number | null;
  nowMs?: number;
}

const ARRIVAL_ROLE_ICON: Record<ArrivalJourneyRole, string> = {
  deplane: "🛬",
  passport: "🛂",
  baggage: "🧳",
  customs: "📄",
  exit: "🚪",
  ground_transport: "🚆",
};

const ARRIVAL_ROLE_ID: Record<ArrivalJourneyRole, string> = {
  deplane: "deplane",
  passport: "immigration",
  baggage: "bags",
  customs: "customs",
  exit: "exit",
  ground_transport: "ride",
};

/** Arrival path matching approved mockup (intl steps only when countries differ). */
export function buildArrivalDayCoachPath(input: ArrivalDayCoachInput): DayCoachPathStep[] {
  const code = input.iata.trim().toUpperCase();
  const intl = isInternationalArrivalFlight(input.departureIata, code);
  const layout = getAirportLayout(code);
  const creds = { tsaPreCheck: false, clear: false, known: true };

  if (layout && layoutSupportsArrivalFirstMile(layout)) {
    const stops = buildArrivalTripJourney(layout, {
      gateCode: input.arrivalGate,
      includePassport: intl,
      includeCustoms: intl,
    });
    if (stops.length > 0) {
      const steps: DayCoachPathStep[] = [];
      let fromNodeId = stops[0]?.nodeId ?? null;

      for (const stop of stops) {
        if (!stop.known || !stop.nodeId) continue;

        let minutes: number | undefined;
        if (fromNodeId && stop.poiId && fromNodeId !== stop.nodeId) {
          const route = computeRoute({
            layout,
            fromNodeId,
            toPoiId: stop.poiId,
            credentials: creds,
          });
          if (route) minutes = Math.max(1, Math.round(route.totalSeconds / 60));
        }
        fromNodeId = stop.nodeId;

        if (stop.role === "ground_transport") {
          const ride = resolveArrivalRideStep({
            iata: code,
            hotelLabel: input.hotelLabel,
            flightArrivalTime: input.flightArrivalTime,
            flightTimezone: input.flightTimezone,
            landedMinutesAgo: input.landedMinutesAgo,
            nowMs: input.nowMs,
            arrivalInfo: getAirportNav(code)?.arrivalInfo,
          });
          steps.push({ ...ride, minutes });
          continue;
        }

        if (stop.role === "baggage") {
          const flightLabel = input.flightNumber?.trim() || "your flight";
          const curated =
            input.baggageCarouselNote?.trim() ||
            getAirportNav(code)?.arrivalInfo?.baggageCarousels?.[0]?.carouselNote ||
            null;
          steps.push({
            id: "bags",
            icon: "🧳",
            text: `Bags — claim for ${flightLabel}`,
            detail:
              curated ||
              stop.detail ||
              "Carousel number is on the airport screens — Kepi does not invent belt numbers.",
            minutes,
          });
          continue;
        }

        steps.push({
          id: ARRIVAL_ROLE_ID[stop.role],
          icon: ARRIVAL_ROLE_ICON[stop.role],
          text: stop.label,
          detail: stop.detail,
          minutes,
        });
      }

      if (steps.length > 0) return steps;
    }
  }

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
    // Global Entry / Mobile Passport Control are U.S. CBP programs — only
    // relevant when arriving INTO the U.S. Showing them for every
    // international arrival (e.g. arriving in Italy) is wrong advice.
    const arrivingInUs = resolveAirport(code)?.country?.toUpperCase() === "US";
    steps.push({
      id: "immigration",
      icon: "🛂",
      text: "Immigration / passport control",
      detail: arrivingInUs
        ? "Have passport ready. Use Global Entry / Mobile Passport Control if enrolled."
        : "Have passport ready for passport control.",
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
  steps.push(
    resolveArrivalRideStep({
      iata: code,
      hotelLabel: hotel,
      flightArrivalTime: input.flightArrivalTime,
      flightTimezone: input.flightTimezone,
      landedMinutesAgo: input.landedMinutesAgo,
      nowMs: input.nowMs,
      arrivalInfo: nav?.arrivalInfo,
    }),
  );

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

const DEPART_ROLE_ICON: Record<JourneyRole, string> = {
  dropoff: "🚗",
  checkin: "🧳",
  security: "🛡",
  lounge: "🛋",
  gate: "🚪",
};

const DEPART_ROLE_ID: Record<JourneyRole, string> = {
  dropoff: "curb",
  checkin: "check-in",
  security: "security",
  lounge: "lounge",
  gate: "gate",
};

export interface DepartDayCoachInput {
  iata: string;
  airlineName?: string | null;
  flightNumber?: string | null;
  gateCode?: string | null;
  departureTerminal?: string | null;
  credentials?: { tsaPreCheck?: boolean; clear?: boolean };
  eligibleLoungeNames?: string[];
}

/**
 * Departure first-mile coach path — curb → check-in → security → (lounge) → gate.
 * Uses the bundled layout graph for honest walk minutes when available; falls back
 * to buildGateInstructions text when no layout is published.
 */
export function buildDepartDayCoachPath(input: DepartDayCoachInput): DayCoachPathStep[] {
  const code = input.iata.trim().toUpperCase();
  const layout = getAirportLayout(code);
  const creds = {
    tsaPreCheck: Boolean(input.credentials?.tsaPreCheck),
    clear: Boolean(input.credentials?.clear),
    known: true,
  };

  const guide = buildGateInstructions(
    code,
    input.gateCode ?? undefined,
    input.departureTerminal ?? undefined,
    creds.clear,
    creds.tsaPreCheck,
    false,
  );
  const securityGuide = guide.steps[0];

  if (layout) {
    const stops = buildTripJourney(layout, {
      airlineName: input.airlineName,
      gateCode: input.gateCode,
      eligibleLoungeNames: input.eligibleLoungeNames,
    });

    const steps: DayCoachPathStep[] = [];
    let fromNodeId = stops[0]?.nodeId ?? null;

    for (const stop of stops) {
      if (!stop.known || !stop.nodeId) {
        if (stop.role === "gate") {
          steps.push({
            id: "gate",
            icon: "🚪",
            text: stop.label,
            detail: stop.detail,
          });
        }
        continue;
      }

      let minutes: number | undefined;
      if (fromNodeId && stop.poiId && fromNodeId !== stop.nodeId) {
        const route = computeRoute({
          layout,
          fromNodeId,
          toPoiId: stop.poiId,
          credentials: creds,
        });
        if (route) minutes = Math.max(1, Math.round(route.totalSeconds / 60));
      }
      fromNodeId = stop.nodeId;

      if (stop.role === "checkin") {
        const checkIn = buildDepartCheckInCoachStep({
          iata: code,
          airlineName: input.airlineName,
          flightNumber: input.flightNumber,
          departureTerminal: input.departureTerminal,
        });
        steps.push({ ...checkIn, minutes });
        continue;
      }

      if (stop.role === "security" && securityGuide) {
        steps.push({
          id: "security",
          icon: securityGuide.icon,
          text: securityGuide.text,
          detail: securityGuide.detail,
          minutes: securityGuide.minutes > 0 ? securityGuide.minutes : minutes,
        });
        continue;
      }

      steps.push({
        id: DEPART_ROLE_ID[stop.role],
        icon: DEPART_ROLE_ICON[stop.role],
        text:
          stop.role === "gate" && input.gateCode
            ? `Gate ${input.gateCode.trim().toUpperCase()}`
            : stop.label,
        detail: stop.detail,
        minutes,
      });
    }

    if (steps.length > 0) return steps;
  }

  const checkIn = buildDepartCheckInCoachStep({
    iata: code,
    airlineName: input.airlineName,
    flightNumber: input.flightNumber,
    departureTerminal: input.departureTerminal,
  });
  return [checkIn, ...tagDepartGuideSteps(guide.steps)];
}
