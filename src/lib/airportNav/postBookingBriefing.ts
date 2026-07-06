import type { LoungeEligibilityResult } from "@/lib/airportNav/types";

export type PostBookingBriefingStage = "eligibility" | "actionable";

export interface PostBookingBriefingFlight {
  id: string;
  airline?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureTimeUtcMs: number | null;
  gate?: string;
  terminal?: string;
  checkInOpenUtcMs?: number | null;
}

export interface PostBookingBriefingCredentials {
  tsaPreCheck: boolean;
  clear: boolean;
  loungeMemberships?: string[];
}

export interface PostBookingBriefingInput {
  flight: PostBookingBriefingFlight;
  credentials: PostBookingBriefingCredentials;
  loungeResults: LoungeEligibilityResult[];
  nowMs?: number;
}

export interface PostBookingBriefingContent {
  stage: PostBookingBriefingStage;
  headline: string;
  bullets: string[];
  actionable: boolean;
  briefingKey: string;
}

const CHECKIN_WINDOW_MS = 24 * 60 * 60 * 1000;

export function computePostBookingBriefingStage(
  flight: PostBookingBriefingFlight,
  nowMs: number,
): PostBookingBriefingStage {
  const gateAssigned = Boolean(flight.gate?.trim());
  const checkInOpen =
    typeof flight.checkInOpenUtcMs === "number"
      ? nowMs >= flight.checkInOpenUtcMs
      : typeof flight.departureTimeUtcMs === "number"
        ? nowMs >= flight.departureTimeUtcMs - CHECKIN_WINDOW_MS
        : false;
  return gateAssigned || checkInOpen ? "actionable" : "eligibility";
}

export function buildPostBookingBriefing(input: PostBookingBriefingInput): PostBookingBriefingContent {
  const nowMs = input.nowMs ?? Date.now();
  const stage = computePostBookingBriefingStage(input.flight, nowMs);
  const entitlementLines: string[] = [];
  if (input.credentials.tsaPreCheck) entitlementLines.push("TSA PreCheck on file");
  if (input.credentials.clear) entitlementLines.push("CLEAR on file");
  const eligibleLounges = input.loungeResults.filter((entry) => entry.eligible);
  if (eligibleLounges.length > 0) {
    entitlementLines.push(
      `Lounge access via ${eligibleLounges.map((entry) => entry.loungeName).join(", ")}`,
    );
  }

  const briefingKey = [
    input.flight.id,
    stage,
    input.flight.gate ?? "",
    eligibleLounges.map((entry) => entry.loungeId).join("|"),
  ].join(":");

  if (stage === "eligibility") {
    return {
      stage,
      headline: "Your airport benefits for this flight",
      bullets:
        entitlementLines.length > 0
          ? entitlementLines
          : ["Add your loyalty cards and trusted traveler numbers in More to unlock airport guidance."],
      actionable: false,
      briefingKey,
    };
  }

  const actionableLines: string[] = [];
  if (input.credentials.clear && input.credentials.tsaPreCheck) {
    actionableLines.push("Use the CLEAR + PreCheck combined lane when you reach security.");
  } else if (input.credentials.clear) {
    actionableLines.push("Head to the CLEAR lane at security.");
  } else if (input.credentials.tsaPreCheck) {
    actionableLines.push("Use the TSA PreCheck lane at security.");
  } else {
    actionableLines.push("Standard security — allow extra time before your gate.");
  }

  for (const lounge of eligibleLounges.slice(0, 2)) {
    const hint =
      lounge.entrySteps?.[0]?.trim() ||
      (lounge.terminalHint ? `${lounge.loungeName ?? "Lounge"} — ${lounge.terminalHint}` : null);
    actionableLines.push(
      hint || `${lounge.loungeName ?? "Lounge"}: check Airport Mode for turn-by-turn directions.`,
    );
  }

  if (input.flight.gate?.trim()) {
    actionableLines.push(
      `Your gate ${input.flight.gate.toUpperCase()}${input.flight.terminal ? ` (${input.flight.terminal})` : ""} — open Airport Mode for the walking route.`,
    );
  } else {
    actionableLines.push("Gate not assigned yet — we'll update this briefing when it is.");
  }

  return {
    stage,
    headline: "Airport plan for this departure",
    bullets: actionableLines,
    actionable: true,
    briefingKey,
  };
}

export function shouldReplaceBriefing(previousKey: string | null, nextKey: string): boolean {
  return previousKey !== nextKey;
}
