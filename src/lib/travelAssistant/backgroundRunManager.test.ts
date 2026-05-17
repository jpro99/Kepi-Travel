import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  BackgroundRunTimeoutError,
  runManagedTravelUpdateBackgroundPass,
} from "@/lib/travelAssistant/backgroundRunManager";
import { BackgroundRunInProgressError, readTravelBackgroundRunState } from "@/lib/travelAssistant/backgroundRunStateStore";
import { resetTravelUpdateCircuitState } from "@/lib/travelAssistant/updateAdapters";
import { persistTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";
import type { TravelUpdateProvider, UpdatableReservation } from "@/lib/travelAssistant/travelUpdateTypes";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("managed background run prevents overlapping executions", async () => {
  resetTravelUpdateCircuitState();
  const runtimeStatePath = `tests/background-manager/runtime/${randomUUID()}`;
  const auditPath = `tests/background-manager/audit/${randomUUID()}`;
  const statePath = `tests/background-manager/state/${randomUUID()}`;
  const lockPath = `tests/background-manager/lock/${randomUUID()}`;

  const slowProvider: TravelUpdateProvider = {
    name: "slow-provider",
    async fetchUpdates() {
      await sleep(120);
      return [];
    },
  };

  await persistTravelRuntimeState({
    reservations: SAMPLE_RESERVATIONS,
    mode: "auto",
    updatedAt: "2026-06-21T10:00:00.000Z",
    storagePath: runtimeStatePath,
  });

  const firstRun = runManagedTravelUpdateBackgroundPass({
    runtimeStatePath,
    auditPath,
    statePath,
    lockPath,
    timeoutMs: 2000,
    checkOptions: {
      providerOverride: slowProvider,
      maxAttempts: 1,
      disableDelay: true,
    },
  });

  await assert.rejects(
    () =>
      runManagedTravelUpdateBackgroundPass({
        runtimeStatePath,
        auditPath,
        statePath,
        lockPath,
        timeoutMs: 2000,
        checkOptions: {
          providerOverride: slowProvider,
          maxAttempts: 1,
          disableDelay: true,
        },
      }),
    BackgroundRunInProgressError,
  );

  const completed = await firstRun;
  assert.equal(completed.status, "success");
  assert.equal(completed.result.audit?.newUpdates, 0);
  const stateAfterSuccess = await readTravelBackgroundRunState(statePath);
  assert.equal(stateAfterSuccess.heartbeat.consecutiveFailures, 0);
  assert.equal(stateAfterSuccess.heartbeat.lastSuccessfulRunAt !== null, true);
});

test("managed background run records timeout and clears active state after completion", async () => {
  resetTravelUpdateCircuitState();
  const runtimeStatePath = `tests/background-manager/runtime/${randomUUID()}`;
  const auditPath = `tests/background-manager/audit/${randomUUID()}`;
  const statePath = `tests/background-manager/state/${randomUUID()}`;
  const lockPath = `tests/background-manager/lock/${randomUUID()}`;

  const verySlowProvider: TravelUpdateProvider = {
    name: "very-slow-provider",
    async fetchUpdates() {
      await sleep(400);
      return [];
    },
  };

  await persistTravelRuntimeState({
    reservations: SAMPLE_RESERVATIONS,
    mode: "auto",
    updatedAt: "2026-06-21T10:00:00.000Z",
    storagePath: runtimeStatePath,
  });

  await assert.rejects(
    () =>
      runManagedTravelUpdateBackgroundPass({
        runtimeStatePath,
        auditPath,
        statePath,
        lockPath,
        timeoutMs: 250,
        checkOptions: {
          providerOverride: verySlowProvider,
          maxAttempts: 1,
          disableDelay: true,
        },
      }),
    BackgroundRunTimeoutError,
  );

  const whileTimedOut = await readTravelBackgroundRunState(statePath);
  assert.notEqual(whileTimedOut.activeRun, null);
  assert.equal(whileTimedOut.lastRun?.status, "timeout");

  await sleep(500);
  const eventuallySettled = await readTravelBackgroundRunState(statePath);
  assert.equal(eventuallySettled.activeRun, null);
  assert.equal(eventuallySettled.lastRun?.status, "timeout");
  assert.equal(eventuallySettled.heartbeat.consecutiveFailures, 1);
  assert.equal(eventuallySettled.heartbeat.lastFailureAt !== null, true);
});
