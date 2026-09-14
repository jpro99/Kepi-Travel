/**
 * Travel Focus Honesty Filter — Breakthrough B2 (Empire Weekly).
 * Maps disruption charges to provenance grades and iOS Focus interruption levels.
 * Green-provenance IDs only pass SetFocusFilterIntent filterCriteria.
 */

import type { ConnectionRisk } from "@/lib/travelAssistant/connectionPlaybook";
import type { FlightFactProvenance } from "@/lib/travelAssistant/dayOfDoorProvenance";
import { isGreenProvenanceForLiveActivity } from "@/lib/travelAssistant/provenanceChargeLiveActivity";
import type { TravelUpdateKind } from "@/lib/travelAssistant/travelUpdateTypes";

/** Charge kinds that may earn timeSensitive under Travel/Sleep Focus. */
export type DisruptionChargeKind =
  | "cancel"
  | "official-gate-change"
  | "missed-connection-risk"
  | "soft-status";

export type DisruptionProvenanceGrade = "green" | "red";

/** APNs / UNNotification interruption level — silent suppresses under Focus. */
export type FocusInterruptionLevel = "time-sensitive" | "passive" | "silent";

export type TravelFocusMode = "travel" | "sleep";

export interface DisruptionChargeInput {
  kind: DisruptionChargeKind;
  provenance: FlightFactProvenance;
  flightNumber: string;
  flightDate: string;
  /** Booked-itinerary gospel node — required for missed-connection-risk timeSensitive. */
  gospelNode?: boolean;
  connectionRisk?: ConnectionRisk | null;
}

export interface TaggedDisruptionCharge {
  disruptionId: string;
  kind: DisruptionChargeKind;
  provenance: FlightFactProvenance;
  provenanceGrade: DisruptionProvenanceGrade;
  interruptionLevel: FocusInterruptionLevel;
  focusFilterEligible: boolean;
  filterCriteria: string;
}

const GREEN_CHARGE_KINDS: readonly DisruptionChargeKind[] = [
  "cancel",
  "official-gate-change",
  "missed-connection-risk",
];

function normalizeFlightToken(flightNumber: string): string {
  return flightNumber.replace(/\s+/gu, "").toUpperCase();
}

function normalizeFlightDate(flightDate: string): string {
  return flightDate.trim();
}

/** Stable disruption id for Focus filterCriteria matching. */
export function buildDisruptionChargeId(input: {
  kind: DisruptionChargeKind;
  flightNumber: string;
  flightDate: string;
}): string {
  const flight = normalizeFlightToken(input.flightNumber);
  const date = normalizeFlightDate(input.flightDate);
  return `kepi:disruption:${date}:${flight}:${input.kind}`;
}

export function gradeDisruptionProvenance(provenance: FlightFactProvenance): DisruptionProvenanceGrade {
  return isGreenProvenanceForLiveActivity(provenance) ? "green" : "red";
}

export function isGospelNodeMissedConnectionRisk(input: {
  gospelNode?: boolean;
  connectionRisk?: ConnectionRisk | null;
}): boolean {
  if (!input.gospelNode) return false;
  return input.connectionRisk === "tight" || input.connectionRisk === "impossible";
}

/** Green charge kinds that may punch through Travel Focus when provenance is green. */
export function isGreenChargeKind(kind: DisruptionChargeKind): boolean {
  return (GREEN_CHARGE_KINDS as readonly string[]).includes(kind);
}

export function resolveDisruptionChargeKindFromUpdate(
  kind: TravelUpdateKind,
  provenance: FlightFactProvenance,
): DisruptionChargeKind {
  if (kind === "cancellation") return "cancel";
  if (kind === "gate-change") {
    return provenance === "ALERT_PUSH_STRING" || provenance === "AIRPORT_FIDS_TEXT"
      ? "official-gate-change"
      : "soft-status";
  }
  if (kind === "delay" || kind === "on-time") return "soft-status";
  return "soft-status";
}

/**
 * interruptionLevel.timeSensitive ONLY on green charges:
 * cancel, official gate change, gospel-node missed-connection RISK.
 * Soft status stays silent under Travel Focus.
 */
export function resolveFocusInterruptionLevel(input: DisruptionChargeInput): FocusInterruptionLevel {
  const grade = gradeDisruptionProvenance(input.provenance);
  if (grade === "red" || input.kind === "soft-status") {
    return "silent";
  }

  if (input.kind === "cancel" || input.kind === "official-gate-change") {
    return "time-sensitive";
  }

  if (
    input.kind === "missed-connection-risk" &&
    isGospelNodeMissedConnectionRisk(input)
  ) {
    return "time-sensitive";
  }

  return "silent";
}

export function tagDisruptionCharge(input: DisruptionChargeInput): TaggedDisruptionCharge {
  const provenanceGrade = gradeDisruptionProvenance(input.provenance);
  const disruptionId = buildDisruptionChargeId({
    kind: input.kind,
    flightNumber: input.flightNumber,
    flightDate: input.flightDate,
  });
  const interruptionLevel = resolveFocusInterruptionLevel(input);
  const focusFilterEligible =
    provenanceGrade === "green" && isGreenChargeKind(input.kind);

  return {
    disruptionId,
    kind: input.kind,
    provenance: input.provenance,
    provenanceGrade,
    interruptionLevel,
    focusFilterEligible,
    filterCriteria: focusFilterEligible ? disruptionId : "",
  };
}

/** Green-only disruption IDs for SetFocusFilterIntent NSPredicate SELF IN %@. */
export function buildFocusFilterCriteria(greenCharges: readonly TaggedDisruptionCharge[]): string[] {
  const ids = greenCharges
    .filter((charge) => charge.focusFilterEligible && charge.filterCriteria)
    .map((charge) => charge.filterCriteria);
  return [...new Set(ids)];
}

export function shouldDeliverUnderTravelFocus(charge: TaggedDisruptionCharge): boolean {
  return charge.focusFilterEligible && charge.interruptionLevel === "time-sensitive";
}

export const TRAVEL_FOCUS_MODES: readonly TravelFocusMode[] = ["travel", "sleep"];
