/**
 * "You're fine" airport coach — one next physical move + one honest on-time clock.
 * No indoor GPS turn-by-turn; landmark language from curated data + day-coach steps.
 */

import { computeBoardingPressure, type BoardingPressure } from "@/lib/airportNav/boardingMath";
import type { DayCoachPathStep } from "@/lib/travelAssistant/airportDayCoach";
import type { ConnectionPlaybook, ConnectionPlaybookStep } from "@/lib/travelAssistant/connectionPlaybook";
import {
  FCO_LE_LAST_DEPARTURE_FCO,
  FCO_LANDSIDE_TRAIN_BUFFER_MIN,
  FCO_ROME_TZ,
  parseFlightArrivalUtcMs,
  resolveFcoArrivalTransportAdvice,
} from "@/lib/travelAssistant/fcoLeonardoExpressSchedule";
import { getAirportNav } from "@/lib/travelAssistant/airportNavigation";
import { timezoneForIata } from "@/lib/airports/lookup";

export type GateCoachState =
  | "fine"
  | "start_walking"
  | "go_now"
  | "recover"
  /** Hub connection clock — tighter than fine, not yet go_now. */
  | "tight"
  /** Hub connection clock — may not make outbound boarding close. */
  | "miss";

export interface GateCoachCta {
  label: string;
  kind: "show_map" | "none";
}

export interface GateConfidenceResult {
  state: GateCoachState;
  /** Human clock line: "19 min early", "start walking", "go now", "late — taxi not train". */
  clockLabel: string;
  nextMove: string;
  nextMoveDetail?: string;
  /** Minutes of slack after walk + security + buffer (depart) or until last train (arrive). */
  spareMinutes: number | null;
  honestyNote?: string;
  cta: GateCoachCta;
}

export interface ArrivalCoachCard {
  id: string;
  title: string;
  detail?: string;
  icon: string;
  scheduleNote?: string | null;
  transportOptions?: ReturnType<typeof resolveFcoArrivalTransportAdvice>["transportOptions"];
}

/** Airport-specific landmark copy — lives in data, not per-airport UI. */
const LANDMARK_COPY: Record<string, Partial<Record<string, { move: string; detail?: string }>>> = {
  ONT: {
    "check-in": {
      move: "Alaska check-in under the Terminal 2 sign",
      detail: "Terminal 2 (gates 201–213) — kiosk, app, or counter",
    },
    security: {
      move: "TSA PreCheck lane — all gates are right past security",
      detail: "ONT is compact; any gate is a short walk after screening",
    },
    gate: {
      move: "Your gate is straight ahead after security",
      detail: "Follow the gate boards — nothing more than a 3-min walk at ONT",
    },
  },
  SEA: {
    security: {
      move: "TSA PreCheck or CLEAR — follow checkpoint signs to your concourse",
      detail: "Connections: stay airside if bags are checked through",
    },
    gate: {
      move: "Follow gate boards to your departure gate",
      detail: "Allow time if you are changing concourses",
    },
    immigration: {
      move: "Passport control — use Global Entry or Mobile Passport if enrolled",
      detail: "Have passport ready for CBP",
    },
  },
  FCO: {
    immigration: {
      move: "Follow passport / Polizia signs",
      detail: "EU lane if eligible; everyone else uses All Passports",
    },
    bags: {
      move: "Baggage claim — carousel on the overhead screens",
      detail: "Kepi does not invent belt numbers — check the airport displays",
    },
    customs: {
      move: "Customs — green channel unless you have goods to declare",
      detail: "Then follow Train / Treno signs toward the rail station",
    },
    ride: {
      move: "Leonardo Express — trains to Roma Termini, not FL1",
      detail: "Tap in at Leonardo gates before boarding — Metrebus / Roma Pass not valid on LE",
    },
  },
};

const DEFAULT_BOARDING_CLOSE_LEAD_MIN = 15;
const DEFAULT_BUFFER_MIN = 10;
/** Widen buffer when walk time is unknown — never fake precision. */
const UNKNOWN_WALK_BUFFER_MIN = 18;
const UNKNOWN_WALK_ESTIMATE_MIN = 12;
/** Within this window of departure, show boarding-pressure early/late (not leave-by). */
export const TRAVEL_DAY_PRESSURE_WINDOW_MIN = 12 * 60;
/** Cap displayed spare on travel day — never show multi-hour "min early" from raw countdown. */
const MAX_DISPLAY_SPARE_MIN = 180;
const MIN_DISPLAY_SPARE_MIN = -120;
const DOMESTIC_LEAVE_BUFFER_MIN = 90;
const INTERNATIONAL_LEAVE_BUFFER_MIN = 180;

const US_DOMESTIC_IATA =
  /^(ONT|SEA|LAX|SFO|JFK|EWR|ORD|DFW|ATL|DEN|BOS|IAD|PHX|LAS|MIA|HNL|ANC)$/u;

function isInternationalDepart(depIata: string, arrIata: string | null | undefined): boolean {
  const dep = depIata.trim().toUpperCase();
  const arr = (arrIata ?? "").trim().toUpperCase();
  if (!dep || !arr) return false;
  return !(US_DOMESTIC_IATA.test(dep) && US_DOMESTIC_IATA.test(arr));
}

function formatLeaveByClock(leaveUtcMs: number, timezone?: string): string {
  if (!Number.isFinite(leaveUtcMs)) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(leaveUtcMs));
}

function clampSpareMinutes(spare: number): number {
  return Math.max(MIN_DISPLAY_SPARE_MIN, Math.min(MAX_DISPLAY_SPARE_MIN, Math.round(spare)));
}

function leaveBufferMinutes(depIata: string, arrIata: string | null | undefined): number {
  return isInternationalDepart(depIata, arrIata)
    ? INTERNATIONAL_LEAVE_BUFFER_MIN
    : DOMESTIC_LEAVE_BUFFER_MIN;
}

function resolveCoachState(spareMinutes: number): GateCoachState {
  if (spareMinutes >= 15) return "fine";
  if (spareMinutes >= 5) return "start_walking";
  if (spareMinutes >= 0) return "go_now";
  return "recover";
}

function clockLabelForState(state: GateCoachState, spareMinutes: number, recoverHint?: string): string {
  switch (state) {
    case "fine":
      return `${Math.max(1, Math.round(spareMinutes))} min early`;
    case "start_walking":
      return "start walking";
    case "go_now":
      return "go now";
    case "recover":
      return recoverHint ?? (spareMinutes < -5 ? "late — head to gate" : "cutting it close");
    default:
      return "check timing";
  }
}

function landmarkForStep(
  iata: string,
  step: Pick<DayCoachPathStep, "id" | "text" | "detail">,
): { move: string; detail?: string } {
  const override = LANDMARK_COPY[iata.trim().toUpperCase()]?.[step.id];
  if (override) return override;
  return { move: step.text, detail: step.detail };
}

export function resolveNextMoveFromCoachStep(input: {
  iata: string;
  step: Pick<DayCoachPathStep, "id" | "text" | "detail"> | null | undefined;
  connectionStep?: ConnectionPlaybookStep | null;
}): { move: string; detail?: string } {
  if (input.connectionStep) {
    return { move: input.connectionStep.text, detail: input.connectionStep.detail };
  }
  if (!input.step) {
    return { move: "Follow airport signs", detail: "Open the map when you need a landmark" };
  }
  return landmarkForStep(input.iata, input.step);
}

export interface DepartGateConfidenceInput {
  iata: string;
  minutesToDeparture: number;
  walkToGateSeconds: number | null;
  securityWaitSeconds?: number;
  throughSecurity?: boolean;
  boardingCloseLeadMin?: number;
  bufferMin?: number;
  currentStep?: Pick<DayCoachPathStep, "id" | "text" | "detail"> | null;
  connectionPlaybook?: ConnectionPlaybook | null;
  connectionStep?: ConnectionPlaybookStep | null;
  arrivalAirport?: string | null;
  departureTimezone?: string | null;
  nowMs?: number;
}

export function computeDepartGateConfidence(input: DepartGateConfidenceInput): GateConfidenceResult {
  const nowMs = input.nowMs ?? Date.now();
  const next = resolveNextMoveFromCoachStep({
    iata: input.iata,
    step: input.currentStep,
    connectionStep: input.connectionStep,
  });

  const walkKnown = input.walkToGateSeconds !== null;
  const honestyNote = !walkKnown
    ? "Walk time unknown — using a wider buffer. Follow posted signs."
    : undefined;

  // Far from departure — show planned leave-by, not raw minutes-until-boarding-close.
  if (input.minutesToDeparture > TRAVEL_DAY_PRESSURE_WINDOW_MIN) {
    const departureUtcMs = nowMs + input.minutesToDeparture * 60_000;
    const bufferMin = leaveBufferMinutes(input.iata, input.arrivalAirport);
    const leaveUtcMs = departureUtcMs - bufferMin * 60_000;
    const tz = input.departureTimezone?.trim() || timezoneForIata(input.iata);
    const leaveClock = formatLeaveByClock(leaveUtcMs, tz);

    return {
      state: "fine",
      clockLabel: leaveClock ? `leave by ${leaveClock}` : "you're fine",
      nextMove: next.move,
      nextMoveDetail: next.detail,
      spareMinutes: null,
      honestyNote,
      cta: { label: "Show map", kind: "show_map" },
    };
  }

  const walkSeconds = walkKnown ? input.walkToGateSeconds! : UNKNOWN_WALK_ESTIMATE_MIN * 60;
  const bufferMin = walkKnown
    ? (input.bufferMin ?? DEFAULT_BUFFER_MIN)
    : (input.bufferMin ?? UNKNOWN_WALK_BUFFER_MIN);

  const pressure: BoardingPressure = computeBoardingPressure({
    minutesToDeparture: input.minutesToDeparture,
    boardingCloseLeadMin: input.boardingCloseLeadMin ?? DEFAULT_BOARDING_CLOSE_LEAD_MIN,
    walkToGateSeconds: walkSeconds,
    securityWaitSeconds: input.securityWaitSeconds ?? 0,
    throughSecurity: input.throughSecurity ?? false,
    bufferMin,
  });

  const spareMinutes = clampSpareMinutes(pressure.spareMinutes);
  const state = resolveCoachState(spareMinutes);

  const recoverHint =
    input.connectionPlaybook && state === "recover"
      ? "late — hurry to your connection gate"
      : undefined;

  return {
    state,
    clockLabel: clockLabelForState(state, spareMinutes, recoverHint),
    nextMove: next.move,
    nextMoveDetail: next.detail,
    spareMinutes,
    honestyNote,
    cta: { label: "Show map", kind: "show_map" },
  };
}

function parseClockToMinutes(clock: string): number {
  const [hour, minute] = clock.split(":").map((part) => Number(part));
  return hour * 60 + minute;
}

function romeLocalMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FCO_ROME_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export interface ArrivalGateConfidenceInput {
  iata: string;
  flightArrivalTime?: string | null;
  flightTimezone?: string | null;
  landedMinutesAgo?: number | null;
  nowMs?: number;
  hotelLabel?: string | null;
  currentStep?: Pick<DayCoachPathStep, "id" | "text" | "detail"> | null;
  /** Minutes still needed for current + remaining arrival steps (schematic). */
  remainingWalkMinutes?: number | null;
}

export function computeArrivalGateConfidence(input: ArrivalGateConfidenceInput): GateConfidenceResult {
  const code = input.iata.trim().toUpperCase();
  const nowMs = input.nowMs ?? Date.now();
  const next = resolveNextMoveFromCoachStep({ iata: code, step: input.currentStep });

  if (code === "FCO") {
    const arrivalUtcMs = parseFlightArrivalUtcMs({
      flightArrivalTime: input.flightArrivalTime,
      arrivalIata: code,
      flightTimezone: input.flightTimezone,
    });
    const nav = getAirportNav(code);
    const baseOptions = nav?.arrivalInfo?.transportOptions ?? [];
    const advice = resolveFcoArrivalTransportAdvice({
      arrivalUtcMs,
      landedMinutesAgo: input.landedMinutesAgo,
      nowMs,
      hotelLabel: input.hotelLabel,
      baseOptions,
      baseGroundTransport: nav?.arrivalInfo?.groundTransport ?? "",
      baseRideStepTitle: nav?.arrivalInfo?.rideStepTitle,
    });

    const lastTrainMin = parseClockToMinutes(FCO_LE_LAST_DEPARTURE_FCO);
    const landsideReadyUtc =
      input.landedMinutesAgo != null && input.landedMinutesAgo >= 0
        ? nowMs - input.landedMinutesAgo * 60_000 + FCO_LANDSIDE_TRAIN_BUFFER_MIN * 60_000
        : !Number.isNaN(arrivalUtcMs)
          ? arrivalUtcMs + FCO_LANDSIDE_TRAIN_BUFFER_MIN * 60_000
          : Number.NaN;

    const remainingWalk = input.remainingWalkMinutes ?? 0;
    const estimatedAtStationMin = Number.isNaN(landsideReadyUtc)
      ? null
      : romeLocalMinutes(landsideReadyUtc) + remainingWalk;

    let spareMinutes: number | null = null;
    if (estimatedAtStationMin != null) {
      spareMinutes = lastTrainMin - estimatedAtStationMin;
    }

    if (advice.preferTaxi) {
      return {
        state: "recover",
        clockLabel: "late — taxi not train",
        nextMove: advice.rideStepTitle,
        nextMoveDetail: advice.rideStepDetail,
        spareMinutes,
        honestyNote: spareMinutes == null ? "Landing time unknown — assuming you may miss last Leonardo Express." : undefined,
        cta: { label: "Show map", kind: "show_map" },
      };
    }

    if (spareMinutes == null) {
      return {
        state: "fine",
        clockLabel: "on track",
        nextMove: next.move,
        nextMoveDetail: next.detail,
        spareMinutes: null,
        honestyNote: "Arrival time unknown — using a wide buffer for Leonardo Express.",
        cta: { label: "Show map", kind: "show_map" },
      };
    }

    const state = resolveCoachState(spareMinutes);
    return {
      state,
      clockLabel: clockLabelForState(state, spareMinutes, "late — taxi not train"),
      nextMove: next.move,
      nextMoveDetail: next.detail,
      spareMinutes,
      cta: { label: "Show map", kind: "show_map" },
    };
  }

  return {
    state: "fine",
    clockLabel: "on track",
    nextMove: next.move,
    nextMoveDetail: next.detail,
    spareMinutes: null,
    cta: { label: "Show map", kind: "show_map" },
  };
}

const ARRIVAL_CARD_ORDER = ["immigration", "bags", "customs", "ride"] as const;

const ARRIVAL_CARD_TITLES: Record<string, string> = {
  immigration: "Passport",
  bags: "Bags",
  customs: "Customs",
  exit: "Exit",
};

/** Build ordered arrival stack cards — FCO: Passport → Bags → Customs → Leonardo. */
export function buildArrivalCoachCards(input: {
  steps: readonly DayCoachPathStep[];
  iata: string;
  scheduleNote?: string | null;
  transportOptions?: ArrivalCoachCard["transportOptions"];
}): ArrivalCoachCard[] {
  const code = input.iata.trim().toUpperCase();
  const byId = new Map(input.steps.map((s) => [s.id, s]));
  const cards: ArrivalCoachCard[] = [];

  for (const id of ARRIVAL_CARD_ORDER) {
    const step = byId.get(id);
    if (!step) continue;
    const landmark = landmarkForStep(code, step);
    const title =
      id === "ride" && code === "FCO"
        ? "Leonardo"
        : (ARRIVAL_CARD_TITLES[id] ?? step.text);
    cards.push({
      id,
      title,
      icon: step.icon,
      detail: landmark.detail ?? step.detail,
      scheduleNote: id === "ride" ? input.scheduleNote : null,
      transportOptions: id === "ride" ? input.transportOptions : undefined,
    });
    cards[cards.length - 1]!.detail = landmark.move !== step.text ? `${landmark.move}${landmark.detail ? ` — ${landmark.detail}` : ""}` : cards[cards.length - 1]!.detail;
  }

  if (cards.length === 0) {
    for (const step of input.steps) {
      if (step.id === "deplane") continue;
      const landmark = landmarkForStep(code, step);
      cards.push({
        id: step.id,
        title: ARRIVAL_CARD_TITLES[step.id] ?? step.text,
        icon: step.icon,
        detail: landmark.detail ?? step.detail,
      });
    }
  }

  return cards;
}

export function arrivalCoachCardOrder(cards: readonly ArrivalCoachCard[]): string[] {
  return cards.map((c) => c.id);
}
