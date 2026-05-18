import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  RuntimeStateUnavailableError,
  runTravelUpdateBackgroundPass,
} from "@/lib/travelAssistant/backgroundOrchestrator";
import { resetTravelUpdateCircuitState } from "@/lib/travelAssistant/updateAdapters";
import { persistTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";
import type {
  TravelUpdateProvider,
  UpdatableReservation,
} from "@/lib/travelAssistant/travelUpdateTypes";

const SAMPLE_RESERVATIONS: UpdatableReservation[] = [
  {
    id: "flight-1",
    type: "flight",
    title: "DL 407 JFK -> SFO",
    confirmationCode: "Y8Q4D2",
    localTime: "2026-06-22 08:15",
    location: "Terminal 4, JFK",
    timezone: "America/New_York",
  },
];

test("background pass uses persisted runtime state and suppresses duplicates", async () => {
  resetTravelUpdateCircuitState();
  const statePath = `tests/background-pass/runtime/${randomUUID()}`;
  const auditPath = `tests/background-pass/audit/${randomUUID()}`;

  const provider: TravelUpdateProvider = {
    name: "background-test-provider",
    async fetchUpdates() {
      return [
        {
          provider: "background-test-provider",
          kind: "delay",
          severity: "warning",
          summary: "DL 407 delayed 22 minutes",
          detail: "Background provider update",
          target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
          delayMinutes: 22,
        },
      ];
    },
  };

  await persistTravelRuntimeState({
    reservations: SAMPLE_RESERVATIONS,
    mode: "auto",
    updatedAt: "2026-06-21T10:00:00.000Z",
    storagePath: statePath,
  });

  const first = await runTravelUpdateBackgroundPass({
    runtimeStatePath: statePath,
    auditPath,
    checkOptions: { providerOverride: provider, disableDelay: true },
    nowIso: "2026-06-21T10:05:00.000Z",
  });
  assert.equal(first.runtimeReservationCount, 1);
  assert.equal(first.result.updates.length, 1);
  assert.equal(first.result.audit?.newUpdates, 1);

  const second = await runTravelUpdateBackgroundPass({
    runtimeStatePath: statePath,
    auditPath,
    checkOptions: { providerOverride: provider, disableDelay: true },
    nowIso: "2026-06-21T10:10:00.000Z",
  });
  assert.equal(second.result.updates.length, 0);
  assert.equal(second.result.audit?.duplicateUpdates, 1);
});

test("background pass fails when runtime state has no reservations", async () => {
  const statePath = `tests/background-pass/runtime/${randomUUID()}`;
  await assert.rejects(
    () => runTravelUpdateBackgroundPass({ runtimeStatePath: statePath }),
    RuntimeStateUnavailableError,
  );
});
