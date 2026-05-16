import assert from "node:assert/strict";
import test from "node:test";
import {
  enforceStatusFloor,
  evaluateTravelOpsHealthPolicy,
  evaluateTravelStatusGovernance,
} from "@/lib/travelAssistant/safetyPolicy";

test("status governance blocks each required guardrail and enforces status floor", () => {
  const staleRuntime = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: true,
    runtimeSnapshotStaleMinutes: 31,
    backgroundRunActive: false,
    backgroundRunLastStatus: null,
  });
  assert.equal(staleRuntime.greenAllowed, false);
  assert.equal(staleRuntime.minimumStatus, "red");
  assert.equal(staleRuntime.blockers[0]?.code, "runtime-snapshot-stale");
  assert.equal(enforceStatusFloor("green", staleRuntime), "red");

  const unresolvedChecklist = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 2,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: false,
    runtimeSnapshotStaleMinutes: 0,
    backgroundRunActive: false,
    backgroundRunLastStatus: null,
  });
  assert.equal(unresolvedChecklist.minimumStatus, "yellow");
  assert.equal(unresolvedChecklist.blockers[0]?.code, "required-readiness-incomplete");
  assert.equal(enforceStatusFloor("green", unresolvedChecklist), "yellow");

  const timelineConflict = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 1,
    runtimeSnapshotIsStale: false,
    runtimeSnapshotStaleMinutes: 0,
    backgroundRunActive: false,
    backgroundRunLastStatus: null,
  });
  assert.equal(timelineConflict.minimumStatus, "red");
  assert.equal(timelineConflict.blockers[0]?.code, "timeline-high-conflict");

  const activeBackground = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: false,
    runtimeSnapshotStaleMinutes: 0,
    backgroundRunActive: true,
    backgroundRunLastStatus: null,
  });
  assert.equal(activeBackground.minimumStatus, "yellow");
  assert.equal(activeBackground.blockers[0]?.code, "background-run-active");
});

test("background timeout or failed runs keep governance active until success recovers", () => {
  const timedOut = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: false,
    runtimeSnapshotStaleMinutes: 0,
    backgroundRunActive: false,
    backgroundRunLastStatus: "timeout",
  });
  assert.equal(timedOut.greenAllowed, false);
  assert.equal(timedOut.minimumStatus, "red");
  assert.ok(timedOut.blockers.some((item) => item.code === "background-run-failed"));

  const failed = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: false,
    runtimeSnapshotStaleMinutes: 0,
    backgroundRunActive: false,
    backgroundRunLastStatus: "failed",
  });
  assert.equal(failed.minimumStatus, "red");

  const recovered = evaluateTravelStatusGovernance({
    unresolvedRequiredChecklistCount: 0,
    highSeverityTimelineIssueCount: 0,
    runtimeSnapshotIsStale: false,
    runtimeSnapshotStaleMinutes: 0,
    backgroundRunActive: false,
    backgroundRunLastStatus: "success",
  });
  assert.equal(recovered.greenAllowed, true);
  assert.equal(recovered.minimumStatus, "green");
  assert.equal(recovered.blockers.length, 0);
});

test("ops health policy transitions green to yellow to red and back", () => {
  const nowMs = Date.parse("2026-06-21T10:05:00.000Z");

  const green = evaluateTravelOpsHealthPolicy({
    runtimeReservationCount: 2,
    auditTrailCount: 4,
    staleMinutes: 3,
    recentErrorCount: 0,
    circuitOpenCount: 0,
    backgroundRunActive: false,
    backgroundRunStartedAt: null,
    backgroundRunTimeoutMs: null,
    backgroundRunLastStatus: "success",
    backgroundConsecutiveFailures: 0,
    backgroundLastSuccessfulRunAt: "2026-06-21T10:03:00.000Z",
    backgroundLastFailureAt: null,
    nowMs,
  });
  assert.equal(green.health, "green");
  assert.equal(green.worker.health, "healthy");

  const yellow = evaluateTravelOpsHealthPolicy({
    runtimeReservationCount: 2,
    auditTrailCount: 4,
    staleMinutes: 12,
    recentErrorCount: 1,
    circuitOpenCount: 0,
    backgroundRunActive: false,
    backgroundRunStartedAt: null,
    backgroundRunTimeoutMs: null,
    backgroundRunLastStatus: "success",
    backgroundConsecutiveFailures: 1,
    backgroundLastSuccessfulRunAt: "2026-06-21T09:54:00.000Z",
    backgroundLastFailureAt: "2026-06-21T09:55:00.000Z",
    nowMs,
  });
  assert.equal(yellow.health, "yellow");
  assert.equal(yellow.worker.health, "degraded");

  const red = evaluateTravelOpsHealthPolicy({
    runtimeReservationCount: 2,
    auditTrailCount: 4,
    staleMinutes: 35,
    recentErrorCount: 0,
    circuitOpenCount: 1,
    backgroundRunActive: false,
    backgroundRunStartedAt: null,
    backgroundRunTimeoutMs: null,
    backgroundRunLastStatus: "timeout",
    backgroundConsecutiveFailures: 4,
    backgroundLastSuccessfulRunAt: "2026-06-21T08:30:00.000Z",
    backgroundLastFailureAt: "2026-06-21T10:00:00.000Z",
    nowMs,
  });
  assert.equal(red.health, "red");
  assert.equal(red.worker.health, "unhealthy");

  const recovered = evaluateTravelOpsHealthPolicy({
    runtimeReservationCount: 2,
    auditTrailCount: 5,
    staleMinutes: 2,
    recentErrorCount: 0,
    circuitOpenCount: 0,
    backgroundRunActive: false,
    backgroundRunStartedAt: null,
    backgroundRunTimeoutMs: null,
    backgroundRunLastStatus: "success",
    backgroundConsecutiveFailures: 0,
    backgroundLastSuccessfulRunAt: "2026-06-21T10:04:00.000Z",
    backgroundLastFailureAt: null,
    nowMs,
  });
  assert.equal(recovered.health, "green");
  assert.equal(recovered.worker.health, "healthy");
});
