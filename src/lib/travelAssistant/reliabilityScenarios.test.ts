import assert from "node:assert/strict";
import test from "node:test";
import { enforceStatusFloor, evaluateTravelStatusGovernance } from "@/lib/travelAssistant/safetyPolicy";
import {
  resetTravelUpdateCircuitState,
  runTravelUpdateCheck,
  type TravelUpdateProvider,
  type UpdatableReservation,
} from "@/lib/travelAssistant/updateAdapters";
import type { TravelExecutionStatus, TravelUpdateEvent } from "@/lib/travelAssistant/travelUpdateTypes";

const SAMPLE_RESERVATIONS: UpdatableReservation[] = [
  {
    id: "flight-1",
    type: "flight",
    title: "DL 407 JFK -> SFO",
    confirmationCode: "Y8Q4D2",
    localTime: "2026-06-22 08:15",
    location: "JFK Terminal 4",
    timezone: "America/New_York",
  },
];

function deriveStatusFromUpdates(updates: readonly TravelUpdateEvent[]): TravelExecutionStatus {
  if (updates.some((event) => event.kind === "cancellation" || event.severity === "critical")) {
    return "red";
  }
  if (updates.some((event) => event.kind === "delay" || event.severity === "warning")) {
    return "yellow";
  }
  return "green";
}

test("scenario: delay chain degrades to yellow", async () => {
  resetTravelUpdateCircuitState();
  const delayProvider: TravelUpdateProvider = {
    name: "delay-provider",
    async fetchUpdates() {
      return [
        {
          provider: "delay-provider",
          kind: "delay",
          severity: "warning",
          summary: "DL 407 delayed 18 minutes",
          detail: "Carrier posted rolling delays.",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
          delayMinutes: 18,
        },
      ];
    },
  };

  const result = await runTravelUpdateCheck({
    mode: "auto",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: { providerOverride: delayProvider, disableDelay: true },
  });
  const governance = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: false,
    runtimeSnapshotStaleMinutes: 0,
    backgroundRunActive: false,
    backgroundRunLastStatus: "success",
    backgroundWorkerHealth: "healthy",
  });
  const finalStatus = enforceStatusFloor(deriveStatusFromUpdates(result.updates), governance);
  assert.equal(finalStatus, "yellow");
});

test("scenario: cancellation or conflict escalates to red", async () => {
  resetTravelUpdateCircuitState();
  const cancellationProvider: TravelUpdateProvider = {
    name: "cancellation-provider",
    async fetchUpdates() {
      return [
        {
          provider: "cancellation-provider",
          kind: "cancellation",
          severity: "critical",
          summary: "DL 407 cancelled",
          detail: "Carrier cancelled segment due to weather.",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
        },
      ];
    },
  };

  const result = await runTravelUpdateCheck({
    mode: "auto",
    reservations: SAMPLE_RESERVATIONS,
    nowIso: "2026-06-21T15:00:00.000Z",
    options: { providerOverride: cancellationProvider, disableDelay: true },
  });
  const governance = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 1,
    runtimeSnapshotIsStale: false,
    runtimeSnapshotStaleMinutes: 0,
    backgroundRunActive: false,
    backgroundRunLastStatus: "timeout",
    backgroundWorkerHealth: "degraded",
  });
  const finalStatus = enforceStatusFloor(deriveStatusFromUpdates(result.updates), governance);
  assert.equal(finalStatus, "red");
});

test("scenario: remediation recovers back to green", async () => {
  const governance = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: false,
    runtimeSnapshotStaleMinutes: 0,
    backgroundRunActive: false,
    backgroundRunLastStatus: "success",
    backgroundWorkerHealth: "healthy",
  });
  const finalStatus = enforceStatusFloor("green", governance);
  assert.equal(finalStatus, "green");
  assert.equal(governance.blockers.length, 0);
});
