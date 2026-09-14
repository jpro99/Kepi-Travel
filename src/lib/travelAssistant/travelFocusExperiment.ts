/**
 * Travel Focus Honesty experiment hooks — stage A/B arms for phone PASS.
 * A: green cancel / official gate-change (timeSensitive)
 * B: soft status-only (silent under Focus)
 */

import type { FlightFactProvenance } from "@/lib/travelAssistant/dayOfDoorProvenance";
import {
  type DisruptionChargeKind,
  type TaggedDisruptionCharge,
  tagDisruptionCharge,
} from "@/lib/travelAssistant/travelFocusHonestyFilter";

export type FocusHonestyExperimentArm = "green-charge" | "soft-status-only";

export type FocusHonestyExperimentScenario =
  | "cancel-green"
  | "gate-change-green"
  | "delay-soft"
  | "missed-connection-gospel";

const EXPERIMENT_ENV_KEY = "KEPI_FOCUS_EXPERIMENT_ARM";
const CLIENT_STORAGE_KEY = "kepi-focus-experiment-arm";

export function isValidFocusExperimentArm(value: string | null | undefined): value is FocusHonestyExperimentArm {
  return value === "green-charge" || value === "soft-status-only";
}

/** Server-side arm from env — null in production unless explicitly staged. */
export function resolveFocusExperimentArmFromEnv(): FocusHonestyExperimentArm | null {
  const raw = process.env[EXPERIMENT_ENV_KEY]?.trim();
  return isValidFocusExperimentArm(raw) ? raw : null;
}

/** Client-side arm override for on-device PASS staging. */
export function resolveFocusExperimentArmFromClient(): FocusHonestyExperimentArm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CLIENT_STORAGE_KEY)?.trim();
    return isValidFocusExperimentArm(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setFocusExperimentArmOnClient(arm: FocusHonestyExperimentArm | null): void {
  if (typeof window === "undefined") return;
  try {
    if (arm) {
      window.localStorage.setItem(CLIENT_STORAGE_KEY, arm);
    } else {
      window.localStorage.removeItem(CLIENT_STORAGE_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}

function scenarioKind(scenario: FocusHonestyExperimentScenario): DisruptionChargeKind {
  switch (scenario) {
    case "cancel-green":
      return "cancel";
    case "gate-change-green":
      return "official-gate-change";
    case "delay-soft":
      return "soft-status";
    case "missed-connection-gospel":
      return "missed-connection-risk";
    default:
      return "soft-status";
  }
}

function scenarioProvenance(scenario: FocusHonestyExperimentScenario): FlightFactProvenance {
  switch (scenario) {
    case "delay-soft":
      return "UNVERIFIED";
    default:
      return "ALERT_PUSH_STRING";
  }
}

/** Build a staged disruption charge for experiment arm A or B. */
export function buildFocusExperimentCharge(
  arm: FocusHonestyExperimentArm,
  scenario: FocusHonestyExperimentScenario,
  flightNumber = "AZ1613",
  flightDate = "2026-09-12",
): TaggedDisruptionCharge {
  const baseKind = scenarioKind(scenario);
  const provenance = scenarioProvenance(scenario);

  if (arm === "soft-status-only") {
    return tagDisruptionCharge({
      kind: "soft-status",
      provenance: "UNVERIFIED",
      flightNumber,
      flightDate,
    });
  }

  return tagDisruptionCharge({
    kind: baseKind,
    provenance,
    flightNumber,
    flightDate,
    gospelNode: scenario === "missed-connection-gospel",
    connectionRisk: scenario === "missed-connection-gospel" ? "tight" : null,
  });
}

export interface FocusExperimentStagePayload {
  arm: FocusHonestyExperimentArm;
  scenario: FocusHonestyExperimentScenario;
  charge: TaggedDisruptionCharge;
  greenFilterCriteria: string[];
}

export function stageFocusHonestyExperiment(
  arm: FocusHonestyExperimentArm,
  scenario: FocusHonestyExperimentScenario,
): FocusExperimentStagePayload {
  const charge = buildFocusExperimentCharge(arm, scenario);
  const greenFilterCriteria =
    arm === "green-charge" && charge.focusFilterEligible ? [charge.filterCriteria] : [];
  return { arm, scenario, charge, greenFilterCriteria };
}
