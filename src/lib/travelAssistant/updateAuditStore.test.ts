import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  persistTravelUpdateAudit,
  readTravelUpdateAuditSnapshot,
} from "@/lib/travelAssistant/updateAuditStore";
import type { TravelUpdateCheckResult } from "@/lib/travelAssistant/travelUpdateTypes";

function buildResult(overrides?: Partial<TravelUpdateCheckResult>): TravelUpdateCheckResult {
  return {
    mode: "mock",
    provider: "mock-transport-adapter",
    updates: [],
    attempts: 1,
    circuitOpen: false,
    error: null,
    providerReports: [],
    ...overrides,
  };
}

test("persists and suppresses duplicate update events across checks", async () => {
  const auditPath = `tests/update-audit/${randomUUID()}`;
  const result = buildResult({
    updates: [
      {
        provider: "mock-flight-ops",
        kind: "delay",
        severity: "warning",
        summary: "DL 407 delayed 20 minutes",
        detail: "Carrier update",
        target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
        delayMinutes: 20,
      },
    ],
  });

  const first = await persistTravelUpdateAudit({
    result,
    checkedAt: "2026-06-21T10:00:00.000Z",
    storagePath: auditPath,
  });
  assert.equal(first.freshUpdates.length, 1);
  assert.equal(first.duplicateUpdates, 0);
  assert.equal(first.summary.newUpdates, 1);
  assert.equal(first.summary.totalKnownEvents, 1);

  const second = await persistTravelUpdateAudit({
    result,
    checkedAt: "2026-06-21T10:05:00.000Z",
    storagePath: auditPath,
  });
  assert.equal(second.freshUpdates.length, 0);
  assert.equal(second.duplicateUpdates, 1);
  assert.equal(second.summary.newUpdates, 0);
  assert.equal(second.summary.totalKnownEvents, 1);
});

test("stores new events when incoming set mixes new and existing updates", async () => {
  const auditPath = `tests/update-audit/${randomUUID()}`;

  const firstResult = buildResult({
    updates: [
      {
        provider: "mock-flight-ops",
        kind: "delay",
        severity: "warning",
        summary: "DL 407 delayed 20 minutes",
        detail: "Carrier update",
        target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
        delayMinutes: 20,
      },
    ],
  });
  await persistTravelUpdateAudit({
    result: firstResult,
    checkedAt: "2026-06-21T10:00:00.000Z",
    storagePath: auditPath,
  });

  const secondResult = buildResult({
    updates: [
      {
        provider: "mock-flight-ops",
        kind: "delay",
        severity: "warning",
        summary: "DL 407 delayed 20 minutes",
        detail: "Carrier update",
        target: { reservationType: "flight", confirmationCode: "Y8Q4D2" },
        delayMinutes: 20,
      },
      {
        provider: "mock-rail-ops",
        kind: "platform-change",
        severity: "warning",
        summary: "Coastline Express moved to platform 7A",
        detail: "Station update",
        target: { reservationType: "train", confirmationCode: "CT-7730" },
        updatedLocation: "Platform 7A",
      },
    ],
  });

  const persisted = await persistTravelUpdateAudit({
    result: secondResult,
    checkedAt: "2026-06-21T10:10:00.000Z",
    storagePath: auditPath,
  });

  assert.equal(persisted.freshUpdates.length, 1);
  assert.equal(persisted.freshUpdates[0]?.provider, "mock-rail-ops");
  assert.equal(persisted.duplicateUpdates, 1);
  assert.equal(persisted.summary.totalKnownEvents, 2);
});

test("readTravelUpdateAuditSnapshot returns recent runs with conflict metadata", async () => {
  const auditPath = `tests/update-audit/${randomUUID()}`;
  await persistTravelUpdateAudit({
    storagePath: auditPath,
    checkedAt: "2026-06-21T10:00:00.000Z",
    result: buildResult({
      providerReports: [
        {
          provider: "mock-flight-ops",
          attempts: 2,
          updateCount: 1,
          circuitOpen: false,
          error: null,
        },
      ],
      conflictResolution: {
        incomingUpdates: 2,
        acceptedUpdates: 1,
        suppressedUpdates: 1,
        conflicts: [
          {
            targetKey: "flight:Y8Q4D2",
            domain: "timing",
            winnerProvider: "mock-flight-ops",
            loserProvider: "mock-rail-ops",
            winnerKind: "delay",
            loserKind: "delay",
            reason: "Higher priority provider",
          },
        ],
      },
    }),
  });

  const snapshot = await readTravelUpdateAuditSnapshot({
    storagePath: auditPath,
    limit: 5,
  });

  assert.equal(snapshot.recentAuditTrail.length, 1);
  assert.equal(snapshot.recentAuditTrail[0]?.conflictAccepted, 1);
  assert.equal(snapshot.recentAuditTrail[0]?.conflictSuppressed, 1);
  assert.equal(snapshot.recentAuditTrail[0]?.providerReports.length, 1);
});
