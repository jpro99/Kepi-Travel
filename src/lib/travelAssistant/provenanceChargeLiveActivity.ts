/**
 * Provenance Charge Live Activity — Dynamic Island / ActivityKit gating (Breakthrough A).
 * Countdown and urgency copy only when day-of provenance is green.
 * TRAVELER_OBSERVED and UNVERIFIED must NEVER drive Island countdown.
 */

import type { DayOfDoorTruth, FlightFactProvenance } from "@/lib/travelAssistant/dayOfDoorProvenance";
import {
  formatDayOfCountdownSuffix,
  resolveFlightStatusDoor,
  resolveGateDoor,
} from "@/lib/travelAssistant/dayOfDoorProvenance";
import {
  buildEc261CoachContent,
  EC261_REGULATION_URL,
} from "@/lib/travelAssistant/ec261Coach";
import type { StrandedDisruptionReason } from "@/lib/travelAssistant/strandedFlightDetector";

/** Green provenance tiers that may drive Live Activity updates. */
export const GREEN_LIVE_ACTIVITY_PROVENANCE: readonly FlightFactProvenance[] = [
  "SCHEDULED_ITINERARY",
  "AIRPORT_FIDS_TEXT",
  "ALERT_PUSH_STRING",
];

export type LiveActivityProvenanceTier = FlightFactProvenance | "TRAVELER_OBSERVED";

export const YOUR_EUROPE_PASSENGER_RIGHTS_URL =
  "https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm";

/** Date-stamped note for 2026 consolidated-text checks — not a claim of amendment. */
export const EC261_AMENDMENT_NOTE_2026 =
  "As of 2026-09-06, verify EUR-Lex for any consolidated amendments to Regulation (EC) No 261/2004 before relying on amounts.";

export function isGreenProvenanceForLiveActivity(provenance: LiveActivityProvenanceTier): boolean {
  return (GREEN_LIVE_ACTIVITY_PROVENANCE as readonly string[]).includes(provenance);
}

export function isRedProvenanceForLiveActivityCountdown(
  provenance: LiveActivityProvenanceTier,
): boolean {
  return provenance === "UNVERIFIED" || provenance === "TRAVELER_OBSERVED";
}

/** Countdown only when at least one door is green and showCountdown is true. */
export function shouldDriveLiveActivityCountdown(
  gateTruth: DayOfDoorTruth,
  statusTruth: DayOfDoorTruth,
): boolean {
  if (
    isRedProvenanceForLiveActivityCountdown(gateTruth.provenance) &&
    isRedProvenanceForLiveActivityCountdown(statusTruth.provenance)
  ) {
    return false;
  }
  const gateGreen = isGreenProvenanceForLiveActivity(gateTruth.provenance);
  const statusGreen = isGreenProvenanceForLiveActivity(statusTruth.provenance);
  if (!gateGreen && !statusGreen) return false;
  return gateTruth.showCountdown || statusTruth.showCountdown;
}

/** Cached official primary-text coach for disruption — survives Home freeze. */
export interface UndyingRightsShell {
  headline: string;
  primaryText: string;
  stepTitles: readonly string[];
  regulationUrl: string;
  yourEuropeUrl: string;
  citedAt: string;
  disclaimer: string;
}

export function buildUndyingRightsShell(
  reason: StrandedDisruptionReason | null | undefined,
): UndyingRightsShell | null {
  if (!reason || reason === "other") return null;
  const coach = buildEc261CoachContent(reason);
  return {
    headline: coach.headline,
    primaryText: coach.careSummary,
    stepTitles: coach.steps.map((step) => step.title),
    regulationUrl: EC261_REGULATION_URL,
    yourEuropeUrl: YOUR_EUROPE_PASSENGER_RIGHTS_URL,
    citedAt: new Date().toISOString().slice(0, 10),
    disclaimer: `${coach.disclaimer} ${EC261_AMENDMENT_NOTE_2026}`,
  };
}

export interface ProvenanceChargeLiveActivityInput {
  gateTruth: DayOfDoorTruth;
  statusTruth: DayOfDoorTruth;
  minutesToDeparture?: number | null;
  flightLabel?: string | null;
  disruptionReason?: StrandedDisruptionReason | null;
  /** Explicit traveler-observed gate — must block countdown even if FIDS is green. */
  travelerObservedGate?: string | null;
}

export interface ProvenanceChargeLiveActivityPayload {
  /** False when both doors are red and no rights shell — skip ActivityKit push. */
  shouldUpdate: boolean;
  primary: string;
  secondary: string;
  tertiary: string;
  progress: number | null;
  showCountdown: boolean;
  countdownSuffix: string | null;
  gateProvenance: FlightFactProvenance;
  statusProvenance: FlightFactProvenance;
  rightsShell: UndyingRightsShell | null;
  webFallbackHonest: string;
}

export function buildProvenanceChargeLiveActivity(
  input: ProvenanceChargeLiveActivityInput,
): ProvenanceChargeLiveActivityPayload {
  const countdownAllowed = shouldDriveLiveActivityCountdown(input.gateTruth, input.statusTruth);
  const travelerOverride = Boolean((input.travelerObservedGate ?? "").trim());
  const effectiveCountdown = countdownAllowed && !travelerOverride;

  const countdownSuffix = effectiveCountdown
    ? formatDayOfCountdownSuffix(
        input.minutesToDeparture,
        input.gateTruth,
        input.statusTruth,
      )
    : null;

  const rightsShell = buildUndyingRightsShell(input.disruptionReason ?? null);

  const gateLine = input.gateTruth.line ?? "Gate unknown — check boards";
  const statusLine = input.statusTruth.line ?? "Check flight status";

  const primary = gateLine;
  const secondary =
    effectiveCountdown && countdownSuffix ? countdownSuffix : statusLine;
  const tertiary = rightsShell
    ? rightsShell.headline
    : effectiveCountdown
      ? "On track"
      : "Verify at airport boards";

  const progress =
    effectiveCountdown &&
    input.minutesToDeparture != null &&
    Number.isFinite(input.minutesToDeparture) &&
    input.minutesToDeparture > 0
      ? Math.max(0, Math.min(1, 1 - input.minutesToDeparture / 180))
      : null;

  const gateGreen = isGreenProvenanceForLiveActivity(input.gateTruth.provenance);
  const statusGreen = isGreenProvenanceForLiveActivity(input.statusTruth.provenance);
  const shouldUpdate = gateGreen || statusGreen || rightsShell != null;

  return {
    shouldUpdate,
    primary,
    secondary,
    tertiary,
    progress,
    showCountdown: effectiveCountdown,
    countdownSuffix,
    gateProvenance: input.gateTruth.provenance,
    statusProvenance: input.statusTruth.provenance,
    rightsShell,
    webFallbackHonest:
      "Live Activity and Dynamic Island require the native iOS app. This card is the honest web fallback — no fake Island.",
  };
}

/** Convenience builder from raw day-of inputs. */
export function buildProvenanceChargeFromDayOfFields(input: {
  bookedGate?: string | null;
  liveGate?: string | null;
  pushGate?: string | null;
  bookedStatus?: string | null;
  liveStatus?: string | null;
  liveCheckedAt?: string | null;
  liveError?: string | null;
  pushAlertStatus?: string | null;
  departureIata?: string | null;
  minutesToDeparture?: number | null;
  disruptionReason?: StrandedDisruptionReason | null;
  travelerObservedGate?: string | null;
}): ProvenanceChargeLiveActivityPayload {
  const gateTruth = resolveGateDoor({
    bookedGate: input.bookedGate,
    liveGate: input.liveGate,
    pushGate: input.pushGate,
    departureIata: input.departureIata,
  });
  const statusTruth = resolveFlightStatusDoor({
    bookedStatus: input.bookedStatus,
    liveStatus: input.liveStatus,
    liveCheckedAt: input.liveCheckedAt,
    liveError: input.liveError,
    pushAlertStatus: input.pushAlertStatus,
    departureIata: input.departureIata,
  });
  return buildProvenanceChargeLiveActivity({
    gateTruth,
    statusTruth,
    minutesToDeparture: input.minutesToDeparture,
    disruptionReason: input.disruptionReason,
    travelerObservedGate: input.travelerObservedGate,
  });
}
