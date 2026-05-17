import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  finalizeTravelBackgroundRun,
  markTravelBackgroundRunActive,
} from "@/lib/travelAssistant/backgroundRunStateStore";
import { buildTravelOpsSnapshot } from "@/lib/travelAssistant/opsSnapshot";
import { persistTravelUpdateAudit } from "@/lib/travelAssistant/updateAuditStore";
import { persistTravelRuntimeState } from "@/lib/travelAssistant/updateRuntimeStateStore";
import type { TravelUpdateCheckResult } from "@/lib/travelAssistant/travelUpdateTypes";

function buildResult(overrides?: Partial<TravelUpdateCheckResult>): TravelUpdateCheckResult {
  return {
    mode: "auto",
    provider: "mock-provider",
    updates: [],
    attempts: 1,
    circuitOpen: false,
    error: null,
    providerReports: [
      {
        provider: "mock-provider",
        attempts: 1,
        updateCount: 0,
        circuitOpen: false,
        error: null,
      },
    ],
    ...overrides,
  };
}

test("buildTravelOpsSnapshot returns green for fresh healthy state", async () => {
  const runtimeStatePath = `tests/ops-snapshot/runtime/${randomUUID()}`;
  const auditPath = `tests/ops-snapshot/audit/${randomUUID()}`;
  const backgroundStatePath = `tests/ops-snapshot/background/${randomUUID()}`;
  const alertAuditPath = `tests/ops-snapshot/alert/${randomUUID()}`;
  await persistTravelRuntimeState({
    storagePath: runtimeStatePath,
    mode: "auto",
    updatedAt: "2026-06-21T10:00:00.000Z",
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
  await persistTravelUpdateAudit({
    storagePath: auditPath,
    checkedAt: "2026-06-21T10:03:00.000Z",
    result: buildResult(),
  });
  const active = await markTravelBackgroundRunActive({
    storagePath: backgroundStatePath,
    runId: "run-success",
    startedAt: "2026-06-21T09:58:00.000Z",
    timeoutMs: 45000,
  });
  await finalizeTravelBackgroundRun({
    storagePath: backgroundStatePath,
    runId: active.runId,
    startedAt: active.startedAt,
    finishedAt: "2026-06-21T10:02:00.000Z",
    status: "success",
    error: null,
    runtimeReservationCount: 1,
    newUpdates: 0,
    duplicateUpdates: 0,
    auditRequestId: null,
  });

  const snapshot = await buildTravelOpsSnapshot({
    nowIso: "2026-06-21T10:05:00.000Z",
    runtimeStatePath,
    auditPath,
    backgroundStatePath,
    alertAuditPath,
    auditLimit: 10,
  });

  assert.equal(snapshot.health, "green");
  assert.equal(snapshot.runtime.isStale, false);
  assert.equal(snapshot.provider.recentErrorCount, 0);
  assert.equal(snapshot.provider.circuitOpenCount, 0);
  assert.equal(snapshot.audit.recentAuditTrail.length, 1);
  assert.equal(snapshot.worker.health, "healthy");
  assert.equal(snapshot.opsActions.recentActions.length, 0);
  assert.equal(snapshot.alertAudit.recentSweeps.length, 0);
});

test("buildTravelOpsSnapshot returns red for stale snapshot and circuit errors", async () => {
  const runtimeStatePath = `tests/ops-snapshot/runtime/${randomUUID()}`;
  const auditPath = `tests/ops-snapshot/audit/${randomUUID()}`;
  const backgroundStatePath = `tests/ops-snapshot/background/${randomUUID()}`;
  const alertAuditPath = `tests/ops-snapshot/alert/${randomUUID()}`;
  await persistTravelRuntimeState({
    storagePath: runtimeStatePath,
    mode: "auto",
    updatedAt: "2026-06-21T09:00:00.000Z",
    reservations: [
      {
        id: "train-1",
        type: "train",
        title: "Coastline Express",
        confirmationCode: "CT-7730",
        localTime: "2026-06-22 09:40",
        location: "SFO Transit Station",
        timezone: "America/Los_Angeles",
      },
    ],
  });
  await persistTravelUpdateAudit({
    storagePath: auditPath,
    checkedAt: "2026-06-21T10:01:00.000Z",
    result: buildResult({
      circuitOpen: true,
      error: "Provider timeout",
      providerReports: [
        {
          provider: "rail-provider",
          attempts: 3,
          updateCount: 0,
          circuitOpen: true,
          error: "Provider timeout",
        },
      ],
    }),
  });
  const active = await markTravelBackgroundRunActive({
    storagePath: backgroundStatePath,
    runId: "run-fail",
    startedAt: "2026-06-21T09:59:00.000Z",
    timeoutMs: 45000,
  });
  await finalizeTravelBackgroundRun({
    storagePath: backgroundStatePath,
    runId: active.runId,
    startedAt: active.startedAt,
    finishedAt: "2026-06-21T10:01:00.000Z",
    status: "timeout",
    error: "Provider timeout",
    runtimeReservationCount: 1,
    newUpdates: 0,
    duplicateUpdates: 0,
    auditRequestId: null,
  });

  const snapshot = await buildTravelOpsSnapshot({
    nowIso: "2026-06-21T10:05:00.000Z",
    runtimeStatePath,
    auditPath,
    backgroundStatePath,
    alertAuditPath,
  });

  assert.equal(snapshot.health, "red");
  assert.equal(snapshot.runtime.isStale, true);
  assert.equal(snapshot.provider.recentErrorCount, 1);
  assert.equal(snapshot.provider.circuitOpenCount, 1);
  assert.ok(snapshot.reasons.some((reason) => reason.includes("stale")));
  assert.ok(snapshot.reasons.some((reason) => reason.includes("circuit open")));
  assert.equal(snapshot.worker.health, "degraded");
  assert.equal(snapshot.alertAudit.recentSweeps.length, 0);
});
