import assert from "node:assert/strict";
import test from "node:test";
import { maybeSendFlightStatusPushAlerts } from "@/lib/travelAssistant/flightStatusPushBridge";
import { generateId } from "@/lib/utils/generateId";

test("flight status push bridge stores baseline without alerting", async () => {
  const userId = `flight-push-${generateId()}`;
  const first = await maybeSendFlightStatusPushAlerts(userId, {
    flightNumber: "AS832",
    flightDate: "2026-07-01",
    departureGate: "C12",
    delayMinutes: 0,
    flightStatus: "scheduled",
  });
  assert.equal(first.sent, 0);
  assert.equal(first.skippedReason, "baseline");
});

test("flight status push bridge skips without pro subscription or push registration", async () => {
  const userId = `flight-push-${generateId()}`;
  await maybeSendFlightStatusPushAlerts(userId, {
    flightNumber: "AS832",
    flightDate: "2026-07-02",
    departureGate: "C12",
    delayMinutes: 0,
    flightStatus: "scheduled",
  });
  const second = await maybeSendFlightStatusPushAlerts(userId, {
    flightNumber: "AS832",
    flightDate: "2026-07-02",
    departureGate: "D4",
    delayMinutes: 0,
    flightStatus: "boarding",
  });
  assert.equal(second.sent, 0);
  assert.ok(second.skippedReason === "plan" || second.skippedReason === "no-subscription");
});
