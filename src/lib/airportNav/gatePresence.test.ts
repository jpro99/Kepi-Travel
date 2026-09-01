import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AT_GATE_METERS,
  distanceToGateMeters,
  gateArrivalBanner,
  gateChangeBanner,
  isAtBookedGate,
} from "./gatePresence";

test("distanceToGateMeters returns null without positions", () => {
  assert.equal(distanceToGateMeters(null, [0, 0]), null);
  assert.equal(distanceToGateMeters([0, 0], null), null);
});

test("isAtBookedGate uses AT_GATE_METERS threshold", () => {
  assert.equal(isAtBookedGate(AT_GATE_METERS), true);
  assert.equal(isAtBookedGate(AT_GATE_METERS + 1), false);
  assert.equal(isAtBookedGate(null), false);
});

test("same coordinate is at the gate", () => {
  const d = distanceToGateMeters([-122.3, 47.4], [-122.3, 47.4]);
  assert.ok(d !== null && d < 1);
  assert.equal(isAtBookedGate(d), true);
});

test("gateArrivalBanner on time vs delayed", () => {
  assert.equal(gateArrivalBanner({ atGate: false, gateCode: "C11" }), null);
  assert.deepEqual(gateArrivalBanner({ atGate: true, gateCode: "C11", delayed: false }), {
    kind: "at_gate_on_time",
    label: "You're here · Gate C11 · on time",
  });
  assert.deepEqual(gateArrivalBanner({ atGate: true, gateCode: "c11", delayed: true }), {
    kind: "at_gate_delayed",
    label: "You're here · Gate C11 · flight delayed",
  });
});

test("gateChangeBanner covers assign and change", () => {
  assert.equal(gateChangeBanner(null, null), null);
  assert.equal(gateChangeBanner("C11", "C11"), null);
  assert.equal(gateChangeBanner(null, "C15"), "Gate assigned · C15");
  assert.equal(gateChangeBanner("C11", "C15"), "Gate changed · C11 → C15");
});
