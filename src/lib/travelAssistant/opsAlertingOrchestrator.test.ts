import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  finalizeTravelBackgroundRun,
  markTravelBackgroundRunActive,
} from "@/lib/travelAssistant/backgroundRunStateStore";
import { runTravelOpsAlertSweep } from "@/lib/travelAssistant/opsAlertingOrchestrator";
import { persistTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";

test("runTravelOpsAlertSweep emits alerts for unhealthy worker states", async () => {
  const runtimeStatePath = `tests/ops-alert/runtime/${randomUUID()}`;
  const backgroundStatePath = `tests/ops-alert/background/${randomUUID()}`;
  const alertStatePath = `tests/ops-alert/state/${randomUUID()}`;
  const received: string[] = [];

  await persistTravelRuntimeState({
    storagePath: runtimeStatePath,
    mode: "auto",
    updatedAt: "2026-06-21T08:00:00.000Z",
    reservations: [
      {
        id: "flight-1",
        type: "flight",
        title: "DL 407 JFK -> SFO",
        confirmationCode: "Y8Q4D2",
        localTime: "2026-06-22 08:15",
        location: "Terminal 4, JFK",
        timezone: "America/New_York",
      },
    ],
  });

  for (let i = 0; i < 3; i += 1) {
    const active = await markTravelBackgroundRunActive({
      storagePath: backgroundStatePath,
      runId: `run-${i}`,
      startedAt: `2026-06-21T09:0${i}:00.000Z`,
      timeoutMs: 45000,
    });
    await finalizeTravelBackgroundRun({
      storagePath: backgroundStatePath,
      runId: active.runId,
      startedAt: active.startedAt,
      finishedAt: `2026-06-21T09:0${i}:40.000Z`,
      status: "timeout",
      error: "Provider timeout",
      runtimeReservationCount: 1,
      newUpdates: 0,
      duplicateUpdates: 0,
      auditRequestId: null,
    });
  }

  const result = await runTravelOpsAlertSweep({
    trigger: "test",
    nowIso: "2026-06-21T10:05:00.000Z",
    cooldownMs: 1000,
    alertStatePath,
    snapshotOptions: { runtimeStatePath, backgroundStatePath },
    notifiers: [
      {
        name: "test-notifier",
        async send({ alert }) {
          received.push(alert.key);
          return { ok: true, detail: "ok" };
        },
      },
    ],
  });

  assert.ok(result.totalAlerts >= 2);
  assert.ok(received.includes("worker-unhealthy"));
  assert.ok(result.sentAlerts >= 1);
});

test("runTravelOpsAlertSweep suppresses repeat alerts inside cooldown", async () => {
  const runtimeStatePath = `tests/ops-alert/runtime/${randomUUID()}`;
  const backgroundStatePath = `tests/ops-alert/background/${randomUUID()}`;
  const alertStatePath = `tests/ops-alert/state/${randomUUID()}`;

  await persistTravelRuntimeState({
    storagePath: runtimeStatePath,
    mode: "auto",
    updatedAt: "2026-06-21T09:50:00.000Z",
    reservations: [
      {
        id: "flight-1",
        type: "flight",
        title: "DL 407 JFK -> SFO",
        confirmationCode: "Y8Q4D2",
        localTime: "2026-06-22 08:15",
        location: "Terminal 4, JFK",
        timezone: "America/New_York",
      },
    ],
  });
  const active = await markTravelBackgroundRunActive({
    storagePath: backgroundStatePath,
    runId: "run-timeout",
    startedAt: "2026-06-21T09:55:00.000Z",
    timeoutMs: 45000,
  });
  await finalizeTravelBackgroundRun({
    storagePath: backgroundStatePath,
    runId: active.runId,
    startedAt: active.startedAt,
    finishedAt: "2026-06-21T09:55:40.000Z",
    status: "timeout",
    error: "Provider timeout",
    runtimeReservationCount: 1,
    newUpdates: 0,
    duplicateUpdates: 0,
    auditRequestId: null,
  });

  const first = await runTravelOpsAlertSweep({
    trigger: "test-first",
    nowIso: "2026-06-21T10:00:00.000Z",
    cooldownMs: 600000,
    alertStatePath,
    snapshotOptions: { runtimeStatePath, backgroundStatePath },
    notifiers: [{ name: "noop", async send() { return { ok: true, detail: "ok" }; } }],
  });
  const second = await runTravelOpsAlertSweep({
    trigger: "test-second",
    nowIso: "2026-06-21T10:02:00.000Z",
    cooldownMs: 600000,
    alertStatePath,
    snapshotOptions: { runtimeStatePath, backgroundStatePath },
    notifiers: [{ name: "noop", async send() { return { ok: true, detail: "ok" }; } }],
  });

  assert.ok(first.sentAlerts >= 1);
  assert.ok(second.suppressedAlerts >= 1);
});
