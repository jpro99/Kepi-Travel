import assert from "node:assert/strict";
import test from "node:test";
import { buildIncidentAutopilotPlan } from "@/lib/travelAssistant/incidentAutopilot";

test("autopilot prioritizes critical recovery actions during red incidents", () => {
  const plan = buildIncidentAutopilotPlan({
    tripStage: "airport",
    tripStatus: "red",
    activeScenario: "missed-flight",
    unresolvedReviewCount: 2,
    blockingIssueCount: 3,
    dueReminderCount: 2,
    pendingSyncCount: 4,
    canSyncItineraryNow: true,
    providerCircuitOpen: true,
    opsHealth: "red",
    workerHealth: "unhealthy",
  });

  assert.equal(plan[0]?.id, "dispatch-reminders");
  assert.ok(plan.some((item) => item.id === "switch-recovery-stage"));
  assert.ok(plan.some((item) => item.id === "run-background-once"));
  assert.ok(plan.some((item) => item.id === "trigger-alert-sweep"));
  assert.ok(plan.some((item) => item.id === "sync-now"));
});

test("autopilot avoids sync recommendation when sync is blocked", () => {
  const plan = buildIncidentAutopilotPlan({
    tripStage: "readiness",
    tripStatus: "yellow",
    activeScenario: "none",
    unresolvedReviewCount: 0,
    blockingIssueCount: 0,
    dueReminderCount: 0,
    pendingSyncCount: 5,
    canSyncItineraryNow: false,
    providerCircuitOpen: false,
    opsHealth: "green",
    workerHealth: "healthy",
  });
  assert.equal(plan.some((item) => item.id === "sync-now"), false);
});

test("autopilot includes review and refresh recommendations for degraded operations", () => {
  const plan = buildIncidentAutopilotPlan({
    tripStage: "arrival",
    tripStatus: "yellow",
    activeScenario: "none",
    unresolvedReviewCount: 1,
    blockingIssueCount: 0,
    dueReminderCount: 0,
    pendingSyncCount: 0,
    canSyncItineraryNow: true,
    providerCircuitOpen: false,
    opsHealth: "yellow",
    workerHealth: "degraded",
  });

  assert.ok(plan.some((item) => item.id === "open-review-top"));
  assert.ok(plan.some((item) => item.id === "refresh-ops"));
});
